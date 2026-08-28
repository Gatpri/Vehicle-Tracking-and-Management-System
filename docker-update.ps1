<#
.SYNOPSIS
  Rebuild changed services and reclaim the space the old image versions leave behind.

.DESCRIPTION
  Docker images are immutable, append-only layer stacks. You cannot patch an
  existing image in place: rebuilding always produces a NEW image, and the old
  one stays on disk untagged ("dangling") until it is pruned. That is why disk
  usage creeps up after a run of rebuilds even when the new image is the same
  size — you are keeping N copies, not updating one.

  Deleting a file and rebuilding DOES shrink the new image (the file is simply
  absent when the layer is rebuilt from source). What does NOT shrink anything
  is deleting a file in a *later* layer — the bytes still sit in the layer
  underneath and the whiteout marker only hides them. This script therefore
  always rebuilds from the Dockerfile rather than trying to mutate an image.

.EXAMPLE
  .\docker-update.ps1                  # rebuild everything changed, restart, prune
  .\docker-update.ps1 backend          # only the backend service
  .\docker-update.ps1 backend,mobile   # several services
  .\docker-update.ps1 -NoPrune         # keep the old images (rollback safety)
  .\docker-update.ps1 -Deep            # also drop the build cache (slow next build)
#>
param(
    [Parameter(Position = 0)]
    [string[]]$Service = @(),

    # Keep the previous image versions instead of pruning them. Use when you may
    # need to roll back; costs one full image copy per rebuild.
    [switch]$NoPrune,

    # Also clear the BuildKit layer cache. Frees the most space but makes the
    # next build a cold one (npm install / pip install re-run from scratch).
    [switch]$Deep
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Get-DockerBytes {
    # docker system df -v is noisy; the summary table is enough and is stable.
    $img = docker system df --format '{{.Type}}|{{.Size}}' 2>$null |
           Where-Object { $_ -like 'Images*' }
    if ($img) { return ($img -split '\|')[1] }
    return 'unknown'
}

$before = Get-DockerBytes
Write-Host "Images on disk before: $before" -ForegroundColor DarkGray

# --- Build -------------------------------------------------------------------
# No --no-cache: the whole point is to reuse the dependency layers and rebuild
# only what actually changed. The Dockerfiles copy source AFTER installing
# dependencies, so a code edit rebuilds a thin layer and leaves npm/pip cached.
Write-Host "`nBuilding..." -ForegroundColor Cyan
if ($Service.Count -gt 0) {
    docker compose build @Service
} else {
    docker compose build
}
if ($LASTEXITCODE -ne 0) { throw "Build failed; nothing was restarted or pruned." }

# --- Restart -----------------------------------------------------------------
# `up -d` recreates only containers whose image or config actually changed.
Write-Host "`nRestarting changed containers..." -ForegroundColor Cyan
if ($Service.Count -gt 0) {
    docker compose up -d @Service
} else {
    docker compose up -d
}
if ($LASTEXITCODE -ne 0) { throw "Startup failed. Check: docker compose logs" }

# --- Reclaim -----------------------------------------------------------------
if (-not $NoPrune) {
    # Only dangling (untagged) images: these are the superseded versions that
    # nothing references any more. Tagged images and running containers are
    # never touched by this.
    Write-Host "`nReclaiming superseded image versions..." -ForegroundColor Cyan
    docker image prune -f | Select-Object -Last 1

    if ($Deep) {
        Write-Host "Clearing build cache (next build will be cold)..." -ForegroundColor Yellow
        docker builder prune -af | Select-Object -Last 1
    }
}

# --- Report ------------------------------------------------------------------
Write-Host "`nImages on disk after:  $(Get-DockerBytes)  (was $before)" -ForegroundColor DarkGray
Write-Host ""
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'

$unhealthy = docker compose ps --format '{{.Name}}\t{{.Status}}' 2>$null |
             Where-Object { $_ -match 'unhealthy|Exited|Restarting' }
if ($unhealthy) {
    Write-Host "`nWARNING - not all services are healthy:" -ForegroundColor Red
    $unhealthy | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "  Inspect with: docker compose logs --tail=50 <service>" -ForegroundColor Yellow
    exit 1
}
Write-Host "`nAll services healthy." -ForegroundColor Green
