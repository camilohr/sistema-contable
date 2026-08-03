# Despliegue del sistema contable para acceso desde la red local.
#
# 1. Compila el backend y el frontend.
# 2. Abre el puerto 3000 en el Firewall de Windows.
# 3. Levanta el backend con PM2 (o en primer plano si se usa -SinPM2).
# 4. Muestra la URL de acceso de la red local.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\desplegar.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\desplegar.ps1 -SinPM2

param(
    [switch]$SinPM2
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== 1/4 Compilando backend ==="
Push-Location (Join-Path $root "backend")
npm run build
if ($LASTEXITCODE -ne 0) { throw "Falló el build del backend" }
Pop-Location

Write-Host "=== 2/4 Compilando frontend ==="
Push-Location (Join-Path $root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { throw "Falló el build del frontend" }
Pop-Location

Write-Host "=== 3/4 Abriendo puerto 3000 en el firewall ==="
& (Join-Path $PSScriptRoot "abrir-puerto.ps1") -Port 3000

Write-Host "=== 4/4 Iniciando el servidor ==="
if ($SinPM2) {
    $srv = Join-Path $root "backend\dist\index.js"
    Write-Host "Iniciando Node en primer plano: node `"$srv`""
    Start-Process -FilePath node -ArgumentList "`"$srv`"" -WorkingDirectory (Join-Path $root "backend")
}
else {
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-not $pm2) {
        Write-Host "PM2 no está instalado. Se usará Node en primer plano." -ForegroundColor Yellow
        $srv = Join-Path $root "backend\dist\index.js"
        Start-Process -FilePath node -ArgumentList "`"$srv`"" -WorkingDirectory (Join-Path $root "backend")
    }
    else {
        Push-Location $root
        pm2 start ecosystem.config.cjs
        pm2 save
        Pop-Location
    }
}

Write-Host ""
Write-Host "=== Acceso desde la red local ==="
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }
foreach ($ip in $ips) {
    Write-Host "  http://$($ip.IPAddress):3000"
}
Write-Host ""
Write-Host "Los clientes de la red local abren esa URL en su navegador."
Write-Host "Para actualizar después de un cambio de código, vuelva a ejecutar este script."
