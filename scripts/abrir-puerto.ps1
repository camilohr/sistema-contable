# Abre o cierra el puerto 3000 (sistema contable) en el Firewall de Windows.
#
# Uso (PowerShell con permisos de administración):
#   powershell -ExecutionPolicy Bypass -File scripts\abrir-puerto.ps1       # abrir
#   powershell -ExecutionPolicy Bypass -File scripts\abrir-puerto.ps1 -Quitar
#
# El acceso se limita al perfil "Privado" (red doméstica/oficina). Si el servidor
# está en una red "Pública" se debe cambiar el perfil de red o usar -Profile.

param(
    [switch]$Quitar,
    [ValidateSet("Private", "Public", "Domain", "Any")]
    [string]$Profile = "Private",
    [int]$Port = 3000
)

$nombre = "Sistema Contable - Puerto $Port (LAN)"

try {
    if ($Quitar) {
        Remove-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue
        Write-Host "Regla eliminada: $nombre"
    }
    else {
        New-NetFirewallRule -DisplayName $nombre -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow -Profile $Profile -ErrorAction Stop | Out-Null
        Write-Host "Regla creada: entrada TCP $Port ($Profile): $nombre"
    }
}
catch {
    Write-Host "No se pudo modificar el firewall." -ForegroundColor Yellow
    Write-Host "Ejecute PowerShell como administrador y vuelva a intentarlo." -ForegroundColor Yellow
    Write-Host "Detalle: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}
