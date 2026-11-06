# Đăng ký (hoặc cập nhật) lịch sao lưu 16:50 hằng ngày trong Windows Task Scheduler.
# Chạy: powershell -ExecutionPolicy Bypass -File sao-luu\dang-ky-lich.ps1
# Gỡ lịch: Unregister-ScheduledTask -TaskName SaoLuuThongKe -Confirm:$false
$python = (Get-Command python).Source
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'   # pythonw: chạy ẩn, không bật cửa sổ đen
if (-not (Test-Path $pythonw)) { $pythonw = $python }
$script = Join-Path $PSScriptRoot 'sao_luu.py'
$root = Split-Path $PSScriptRoot
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At '16:50'
# StartWhenAvailable: máy tắt/ngủ lúc 16:50 thì chạy bù khi bật lại. Lỗi (mạng, ổ Z:) thì thử lại 3 lần, cách 10 phút.
# Interactive: chỉ chạy khi đã đăng nhập Windows (cần để thấy ổ Z: đã nối).
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName 'SaoLuuThongKe' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Get-ScheduledTask -TaskName 'SaoLuuThongKe' | Select-Object TaskName, State
