#Requires -Version 5.1
<#
  Diagnose.ps1 — پیدا کردن علتِ گیر کردن اسکریپت
  ورد را «قابل مشاهده» باز می‌کند تا اگر پنجره‌ی پنهانی منتظر جواب است، ببینیدش.
#>
param([string]$File = "")

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Step { param($m) Write-Host ("`n>>> " + $m) -ForegroundColor Cyan }
function OK   { param($m) Write-Host ("    " + $m) -ForegroundColor Green }
function Bad  { param($m) Write-Host ("    " + $m) -ForegroundColor Red }
function Note { param($m) Write-Host ("    " + $m) -ForegroundColor Yellow }

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# ---------------------------------------------------------------- ۱ فایل
Step "۱) پیدا کردن فایل ورودی"
if ([string]::IsNullOrWhiteSpace($File)) {
    $c = @(Get-ChildItem $root -File -EA SilentlyContinue) +
         @(Get-ChildItem (Join-Path $root 'input') -File -EA SilentlyContinue)
    $c = @($c | Where-Object { $_.Extension -match '^\.(dot|dotx|dotm|doc|docx|docm)$' })
    if ($c.Count -eq 0) { Bad "هیچ فایل وردی پیدا نشد."; Read-Host "`nEnter"; exit 1 }
    $File = $c[0].FullName
}
OK $File
OK ("حجم: {0:N0} کیلوبایت" -f ((Get-Item $File).Length / 1KB))

# ---------------------------------------------------------------- ۲ MOTW
Step "۲) بررسی علامتِ «فایل از اینترنت» (Mark of the Web)"
$zone = Get-Content -Path $File -Stream Zone.Identifier -EA SilentlyContinue
if ($zone) {
    Note "فایل علامت‌دار است — ورد آن را در Protected View باز می‌کند و در حالت نامرئی قفل می‌شود."
    Unblock-File -Path $File
    OK "علامت برداشته شد."
} else { OK "علامتی ندارد." }

# ---------------------------------------------------------------- ۳ Word باز
Step "۳) بررسی نمونه‌های باز مانده‌ی Word"
$p = @(Get-Process WINWORD -EA SilentlyContinue)
if ($p.Count -gt 0) {
    Note ("{0} نمونه‌ی WINWORD در حال اجراست (PID: {1})." -f $p.Count, ($p.Id -join ', '))
    Note "اگر از اجرای قبلی گیرکرده مانده‌اند، از Task Manager ببندیدشان و دوباره این را اجرا کنید."
} else { OK "هیچ نمونه‌ای باز نیست." }

# ---------------------------------------------------------------- ۴ اجرا
Step "۴) اجرای Word (قابل مشاهده — اگر پنجره‌ای باز شد، همان علتِ گیر کردن است)"
$sw = [Diagnostics.Stopwatch]::StartNew()
$word = New-Object -ComObject Word.Application
OK ("ساخته شد در {0:N1} ثانیه — نسخه {1}" -f $sw.Elapsed.TotalSeconds, $word.Version)

$word.Visible       = $true
$word.DisplayAlerts = 0
try { $word.AutomationSecurity = 3; OK "ماکروها غیرفعال شد." } catch { Note "AutomationSecurity تنظیم نشد." }
try { $word.Options.ConfirmConversions = $false } catch {}
try { $word.Options.Pagination = $false; OK "صفحه‌بندی پس‌زمینه خاموش شد." } catch {}

$ext = [IO.Path]::GetExtension($File).ToLower()
$doc = $null

if ($ext -in @('.dot','.dotx','.dotm')) {
    Step "۵-الف) Documents.Add (ساخت سند از روی قالب)"
    $sw.Restart()
    try {
        $doc = $word.Documents.Add($File, $false, 0, $false)
        OK ("موفق در {0:N1} ثانیه — {1:N0} کاراکتر" -f $sw.Elapsed.TotalSeconds, $doc.Content.End)
        if ($doc.Content.End -lt 100) { Note "محتوا منتقل نشد؛ سراغ Documents.Open می‌رویم."; $doc.Close(0); $doc = $null }
    } catch { Bad ("نشد: " + $_.Exception.Message); $doc = $null }
}

if ($null -eq $doc) {
    Step "۵-ب) Documents.Open"
    $sw.Restart()
    $doc = $word.Documents.Open($File, $false, $false, $false)
    OK ("موفق در {0:N1} ثانیه — {1:N0} کاراکتر" -f $sw.Elapsed.TotalSeconds, $doc.Content.End)
}

Step "۶) خواندن متن"
$sw.Restart()
$txt = $doc.Content.Text
OK ("{0:N0} کاراکتر در {1:N1} ثانیه" -f $txt.Length, $sw.Elapsed.TotalSeconds)
$paras = ($txt -split "`r").Count
OK ("{0:N0} پاراگراف" -f $paras)
OK ("۵۰ کاراکتر اول: " + $txt.Substring(0, [Math]::Min(50, $txt.Length)))

Step "۷) تست سرعت: یک Find/Replace روی کل سند"
$sw.Restart()
$f = $doc.Content.Find
$f.ClearFormatting(); $f.Replacement.ClearFormatting()
$null = $f.Execute("^p^p", $false, $false, $false, $false, $false, $true, 1, $false, "^p", 2)
OK ("{0:N1} ثانیه" -f $sw.Elapsed.TotalSeconds)

Step "۸) تست سرعت: ساخت ۱۰ پاورقی"
$sw.Restart()
$pos = 0
for ($n = 1; $n -le 10; $n++) {
    $r = $doc.Range($pos, $doc.Content.End)
    $fd = $r.Find; $fd.ClearFormatting(); $fd.MatchWildcards = $false; $fd.Format = $false
    if ($fd.Execute("($n)", $false, $false, $false, $false, $false, $true, 0, $false)) {
        $at = $r.Start; $r.Text = ''
        $fn = $doc.Footnotes.Add($doc.Range($at, $at)); $fn.Range.Text = "تست $n"
        $pos = $at + 1
    }
}
OK ("{0:N1} ثانیه برای ۱۰ پاورقی  →  تخمین کل ۱۳۳۰ تا: {1:N0} ثانیه" -f `
    $sw.Elapsed.TotalSeconds, ($sw.Elapsed.TotalSeconds * 133))

Step "پایان — سند بدون ذخیره بسته می‌شود"
$doc.Close(0)
$word.Quit()
Write-Host "`nهمه‌ی مراحل رد شد. عددهای بالا را بفرستید.`n" -ForegroundColor Green
Read-Host "برای بستن Enter بزنید"
