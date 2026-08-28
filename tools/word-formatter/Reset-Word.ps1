#Requires -Version 5.1
<#
  Reset-Word.ps1 — بازگرداندن Word به حالت سالم
  بعد از چند بار بسته شدن ناگهانی، Word پنجره‌ی «بازیابی فایل‌ها» را نشان می‌دهد
  و تا وقتی آن باز است، همه‌ی فراخوانی‌های خودکار را رد می‌کند
  (خطای Call was rejected by callee).
#>
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function Step { param($m) Write-Host ("`n>>> " + $m) -ForegroundColor Cyan }
function OK   { param($m) Write-Host ("    " + $m) -ForegroundColor Green }
function Note { param($m) Write-Host ("    " + $m) -ForegroundColor Yellow }

Step "۱) بستن همه‌ی نمونه‌های Word"
$p = @(Get-Process WINWORD -EA SilentlyContinue)
if ($p.Count -gt 0) {
    $p | ForEach-Object { try { $_.Kill() } catch {} }
    Start-Sleep -Seconds 2
    OK ("{0} نمونه بسته شد." -f $p.Count)
} else { OK "چیزی باز نبود." }

Step "۲) پاک کردن کلید Resiliency (فهرست موارد غیرفعال‌شده بعد از کرش)"
$n = 0
Get-ChildItem 'HKCU:\Software\Microsoft\Office' -EA SilentlyContinue | ForEach-Object {
    $k = Join-Path $_.PSPath 'Word\Resiliency'
    if (Test-Path $k) { Remove-Item $k -Recurse -Force -EA SilentlyContinue; $n++ }
}
OK ("{0} کلید پاک شد." -f $n)

Step "۳) فایل‌های بازیابی (.asd) که پنجره‌ی Recovery را باز می‌کنند"
$dirs = @(
    (Join-Path $env:APPDATA 'Microsoft\Word'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Office\UnsavedFiles')
)
$asd = @()
foreach ($d in $dirs) {
    if (Test-Path $d) { $asd += @(Get-ChildItem $d -Filter *.asd -File -EA SilentlyContinue) }
}
if ($asd.Count -eq 0) { OK "فایل بازیابی‌ای وجود ندارد." }
else {
    Note ("{0} فایل بازیابی پیدا شد:" -f $asd.Count)
    $asd | ForEach-Object { Note ("   " + $_.FullName) }
    Note "این‌ها از بسته شدن‌های ناگهانی مانده‌اند."
    Note "اگر فایل ذخیره‌نشده‌ی مهمی ندارید، پاکشان کنیم؟"
    $a = Read-Host "    برای پاک کردن  y  بزنید، وگرنه Enter"
    if ($a -match '^[yYبآ]') {
        $asd | ForEach-Object { Remove-Item $_.FullName -Force -EA SilentlyContinue }
        OK "پاک شدند."
    } else { Note "دست نخوردند — ممکن است پنجره‌ی بازیابی باز شود." }
}

Step "۴) تست: باز کردن Word و بستن آن"
try {
    $w = New-Object -ComObject Word.Application
    $w.Visible = $true
    Start-Sleep -Seconds 2
    OK ("Word نسخه {0} پاسخ داد — {1} سند باز" -f $w.Version, $w.Documents.Count)
    $w.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($w)
    OK "بسته شد."
} catch { Write-Host ("    ناموفق: " + $_.Exception.Message) -ForegroundColor Red }

Write-Host "`nحالا run.bat را اجرا کنید.`n" -ForegroundColor Green
Read-Host "برای بستن Enter بزنید"
