$port = 1420
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue

  if ($process -and $process.ProcessName -eq "node") {
    Stop-Process -Id $process.Id -Force
    Start-Sleep -Milliseconds 300
  } elseif ($process) {
    Write-Error "Port $port is already in use by $($process.ProcessName) (PID $($process.Id))."
    exit 1
  }
}

& npm.cmd run dev
