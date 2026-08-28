# Allow a phone on the same wifi to reach the dev servers on this machine.
#
# Windows Firewall on this machine is ON with BlockInbound, and there are no
# rules for the two dev ports, so every connection from the phone is dropped
# before it reaches anything. That surfaces on the device as:
#
#     Could not connect to the server -- exp://<ip>:8081
#
# ...which looks like an Expo problem and is not one.
#
# Ports:
#   8081  Metro bundler (serves the JS bundle and the exp:// dev URL)
#   3000  the Express backend the app calls for /api
#
# RUN THIS ONCE, AS ADMINISTRATOR:
#   right-click PowerShell -> "Run as administrator", then:
#   powershell -ExecutionPolicy Bypass -File .\allow-firewall-dev-ports.ps1
#
# Scoped to Private networks only, so this does not open the ports on a public
# or coffee-shop network. To undo:
#   Remove-NetFirewallRule -DisplayName "Expo Metro (dev)"
#   Remove-NetFirewallRule -DisplayName "Vehicle Safety backend (dev)"

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This needs Administrator. Re-open PowerShell as admin and run it again." -ForegroundColor Red
    exit 1
}

$rules = @(
    @{ Name = "Expo Metro (dev)";             Port = 8081 },
    @{ Name = "Vehicle Safety backend (dev)"; Port = 3000 }
)

foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host ("already present: {0} (port {1})" -f $r.Name, $r.Port) -ForegroundColor DarkGray
        continue
    }

    # Scoped to the profile the wifi is ACTUALLY in, not an assumed "Private".
    # Windows classifies most home wifi as Public unless you change it, and a
    # rule written for Private is silently inert on a Public network -- which
    # looks exactly like the rule not working.
    $profileName = (Get-NetConnectionProfile |
        Where-Object { $_.InterfaceAlias -match "Wi-?Fi" } |
        Select-Object -First 1 -ExpandProperty NetworkCategory)
    if (-not $profileName) { $profileName = "Any" }

    New-NetFirewallRule `
        -DisplayName $r.Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $r.Port `
        -Profile $profileName | Out-Null

    Write-Host ("added: {0} -> TCP {1} inbound ({2})" -f $r.Name, $r.Port, $profileName) -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Now start Metro with the current wifi address:" -ForegroundColor Cyan

$wifi = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.InterfaceAlias -match "Wi-?Fi" -and
        $_.IPAddress -notlike "169.254.*"
    } |
    Select-Object -First 1 -ExpandProperty IPAddress

if ($wifi) {
    Write-Host ""
    Write-Host ("  `$env:REACT_NATIVE_PACKAGER_HOSTNAME='{0}'; npx expo start --clear" -f $wifi)
    Write-Host ""
    Write-Host ("  and check .env has:  EXPO_PUBLIC_API_URL=http://{0}:3000" -f $wifi)
} else {
    Write-Host "  (could not detect the wifi address -- check 'ipconfig')"
}
