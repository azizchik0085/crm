$iniPath = "C:\Users\user\AppData\Roaming\MicroSIP\MicroSIP.ini"
$pythonPath = "C:\Users\user\AppData\Local\Programs\Python\Python311\python.exe"
$scriptPath = "C:\Users\user\.gemini\antigravity\scratch\erp-crm-app\call_handler.py"

# Stop MicroSIP
$proc = Get-Process -Name "microsip" -ErrorAction SilentlyContinue
$exePath = $null
if ($proc) {
    $exePath = $proc.Path
    Write-Host "Stopping MicroSIP running at: $exePath"
    Stop-Process -Name "microsip" -Force
    Start-Sleep -Seconds 1
}

# Update INI
if (Test-Path $iniPath) {
    $content = Get-Content -Path $iniPath -Raw
    
    $content = $content -replace 'cmdOutgoingCall=.*', "cmdOutgoingCall=`"$pythonPath`" `"$scriptPath`" --event outgoing --phone"
    $content = $content -replace 'cmdIncomingCall=.*', "cmdIncomingCall=`"$pythonPath`" `"$scriptPath`" --event incoming --phone"
    $content = $content -replace 'cmdCallStart=.*', "cmdCallStart=`"$pythonPath`" `"$scriptPath`" --event start --phone"
    $content = $content -replace 'cmdCallEnd=.*', "cmdCallEnd=`"$pythonPath`" `"$scriptPath`" --event end --phone"

    Set-Content -Path $iniPath -Value $content -Force
    Write-Host "MicroSIP.ini triggers successfully updated to Python."
} else {
    Write-Host "Error: MicroSIP.ini not found at $iniPath"
}

# Restart MicroSIP
if ($exePath) {
    Write-Host "Restarting MicroSIP..."
    Start-Process -FilePath $exePath
} else {
    if (Test-Path "C:\Program Files\MicroSIP\microsip.exe") {
        Start-Process -FilePath "C:\Program Files\MicroSIP\microsip.exe"
    } elseif (Test-Path "C:\Program Files (x86)\MicroSIP\microsip.exe") {
        Start-Process -FilePath "C:\Program Files (x86)\MicroSIP\microsip.exe"
    } elseif (Test-Path "C:\Users\user\AppData\Local\MicroSIP\MicroSIP.exe") {
        Start-Process -FilePath "C:\Users\user\AppData\Local\MicroSIP\MicroSIP.exe"
    }
}
