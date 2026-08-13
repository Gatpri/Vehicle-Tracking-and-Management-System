#!/usr/bin/env pwsh

# Quick Start Script for Docker Compose (PowerShell)
# This script provides an easy way to start the project

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ANPR Service - Docker Compose Launcher" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker is installed: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✓ Docker daemon is running" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker daemon is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Check if .env file exists
if (-not (Test-Path .env)) {
    Write-Host "WARNING: .env file not found" -ForegroundColor Yellow
    Write-Host "Creating .env from .env.example template..."
    Copy-Item .env.example .env
    Write-Host "✓ Created .env file" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: Edit .env and fill in the blank values, including:" -ForegroundColor Yellow
    Write-Host "  - JWT_SECRET  (generate: openssl rand -hex 32)" -ForegroundColor Yellow
    Write-Host "  - GEMINI_API_KEY" -ForegroundColor Yellow
    Write-Host "  - FIREBASE_PRIVATE_KEY" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue"
}

function Show-Menu {
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1 - Start all services (build if needed)" -ForegroundColor White
    Write-Host "  2 - Start services in background" -ForegroundColor White
    Write-Host "  3 - View logs" -ForegroundColor White
    Write-Host "  4 - Stop all services" -ForegroundColor White
    Write-Host "  5 - Restart services" -ForegroundColor White
    Write-Host "  6 - Clean up everything (delete volumes)" -ForegroundColor Red
    Write-Host "  7 - Build images" -ForegroundColor White
    Write-Host "  8 - View service status" -ForegroundColor White
    Write-Host "  9 - View backend logs" -ForegroundColor White
    Write-Host "  10 - View ANPR logs" -ForegroundColor White
    Write-Host "  0 - Exit" -ForegroundColor White
    Write-Host ""
}

function Start-AllServices {
    Write-Host ""
    Write-Host "Building and starting services..." -ForegroundColor Cyan
    Write-Host "This may take a few minutes on first run..." -ForegroundColor Yellow
    docker-compose up --build
}

function Start-BackgroundServices {
    Write-Host ""
    Write-Host "Starting services in background..." -ForegroundColor Cyan
    docker-compose up -d
    Start-Sleep -Seconds 5
    Write-Host ""
    Write-Host "✓ Services started!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access the application at:" -ForegroundColor Cyan
    Write-Host "  - Frontend: http://localhost" -ForegroundColor White
    Write-Host "  - Backend: http://localhost:3000" -ForegroundColor White
    Write-Host "  - ANPR Service: http://localhost:8000" -ForegroundColor White
    Write-Host ""
    Write-Host "View logs with: docker-compose logs -f" -ForegroundColor Yellow
}

function View-Logs {
    Write-Host ""
    docker-compose logs -f
}

function Stop-Services {
    Write-Host ""
    Write-Host "Stopping all services..." -ForegroundColor Cyan
    docker-compose down
    Write-Host "✓ Services stopped!" -ForegroundColor Green
}

function Restart-Services {
    Write-Host ""
    Write-Host "Restarting services..." -ForegroundColor Cyan
    docker-compose restart
    Write-Host "✓ Services restarted!" -ForegroundColor Green
}

function Cleanup-Everything {
    Write-Host ""
    Write-Host "WARNING: This will delete all volumes and data!" -ForegroundColor Red
    $confirm = Read-Host "Are you sure? (yes/no)"
    if ($confirm -eq "yes") {
        Write-Host ""
        Write-Host "Cleaning up..." -ForegroundColor Cyan
        docker-compose down -v
        Write-Host "✓ Everything cleaned up!" -ForegroundColor Green
    } else {
        Write-Host "Cancelled." -ForegroundColor Yellow
    }
}

function Build-Images {
    Write-Host ""
    Write-Host "Building images (no cache)..." -ForegroundColor Cyan
    Write-Host "This may take several minutes..." -ForegroundColor Yellow
    docker-compose build --no-cache
    Write-Host "✓ Build complete!" -ForegroundColor Green
}

function Show-Status {
    Write-Host ""
    docker-compose ps
    Write-Host ""
}

function View-BackendLogs {
    Write-Host ""
    docker-compose logs -f backend
}

function View-AnprLogs {
    Write-Host ""
    docker-compose logs -f anpr_service
}

# Main loop
while ($true) {
    Show-Menu
    $choice = Read-Host "Enter your choice (0-10)"
    
    switch ($choice) {
        "1" { Start-AllServices; break }
        "2" { Start-BackgroundServices }
        "3" { View-Logs; break }
        "4" { Stop-Services }
        "5" { Restart-Services }
        "6" { Cleanup-Everything }
        "7" { Build-Images }
        "8" { Show-Status }
        "9" { View-BackendLogs; break }
        "10" { View-AnprLogs; break }
        "0" { 
            Write-Host ""
            Write-Host "Exiting..." -ForegroundColor Cyan
            break 
        }
        default { 
            Write-Host ""
            Write-Host "Invalid choice. Please try again." -ForegroundColor Red 
        }
    }
}

Write-Host ""
