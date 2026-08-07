# Programa el respaldo automático del sistema contable como tarea de Windows.
#
# Uso (PowerShell como usuario con permisos de administración):
#   powershell -ExecutionPolicy Bypass -File backend\scripts\programar-respaldo.ps1
#
# Parámetros opcionales:
#   -Keep 14     número de respaldos a conservar
#   -Day Daily   frecuencia: "Daily" para todos los días o un día de la semana
#   -Time "22:00" hora de ejecución
#   -TaskName "SistemaContable-Respaldo"

param(
    [int]$Keep = 14,
    [ValidateSet("Daily","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")]
    [string]$Day = "Daily",
    [string]$Time = "22:00",
    [string]$TaskName = "SistemaContable-Respaldo"
)

$ErrorActionPreference = "Stop"

$node = (Get-Command node).Source
if (-not $node) {
    throw "No se encontro node.exe en el PATH. Instale Node.js y vuelva a intentarlo."
}

$backendDir = Split-Path -Parent $PSScriptRoot
$script = Join-Path $backendDir "scripts\backup.mjs"

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --keep $Keep" -WorkingDirectory $backendDir
if ($Day -eq "Daily") {
    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
} else {
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $Time
}
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Respaldo automatico de la base de datos del sistema contable" -Force | Out-Null

Write-Host "Tarea programada: $TaskName"
Write-Host "  Script:  $script"
Write-Host "  Cuando:  cada $Day a las $Time"
Write-Host "  Retencion: $Keep respaldos"
Write-Host ""
Write-Host "Para ver/ejecutar la tarea:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-ScheduledTaskInfo -TaskName '$TaskName'"
