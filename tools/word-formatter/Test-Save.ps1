#Requires -Version 5.1
<#
  Test-Save.ps1 — کدام روشِ ذخیره روی این فایل کار می‌کند؟
  مرحله‌ها از کم‌خطر به پرخطر مرتب شده‌اند. هرجا ایستاد، همان‌جا مشکل است؛
  شماره‌ی آخرین مرحله‌ای که چاپ شده را بفرستید.
#>
param([string]$File = "")

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function Step { param($m) Write-Host ("`n>>> " + $m) -ForegroundColor Cyan }
function OK   { param($m) Write-Host ("    " + $m) -ForegroundColor Green }
function Bad  { param($m) Write-Host ("    " + $m) -ForegroundColor Red }

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrWhiteSpace($File)) {
    $c = @(Get-ChildItem $root -File -EA SilentlyContinue) +
         @(Get-ChildItem (Join-Path $root 'input') -File -EA SilentlyContinue)
    $c = @($c | Where-Object { $_.Extension -match '^\.(dot|dotx|dotm|doc|docx|docm)$' })
    if ($c.Count -eq 0) { Bad "فایل وردی پیدا نشد."; Read-Host "Enter"; exit 1 }
    $File = $c[0].FullName
}
Write-Host "`nفایل: $File" -ForegroundColor White

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("wtest-" + (Get-Random))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$sw = [Diagnostics.Stopwatch]::StartNew()

$word = New-Object -ComObject Word.Application
$word.Visible = $true
$word.DisplayAlerts = 0
try { $word.AutomationSecurity = 3 } catch {}
try { $word.Options.Pagination = $false } catch {}

# --------------------------------------------------------------- مرحله ۱
Step "مرحله ۱ — باز کردن فایل"
$sw.Restart()
$doc = $word.Documents.Add($File, $false, 0, $true)
OK ("{0:N1} ثانیه — {1:N0} کاراکتر" -f $sw.Elapsed.TotalSeconds, $doc.Content.End)
try { $doc.SpellingChecked = $true; $doc.GrammarChecked = $true } catch {}
try { $doc.AttachedTemplate = $word.NormalTemplate.FullName; OK "قالب جدا شد." } catch { Bad "جدا کردن قالب نشد." }

# --------------------------------------------------------------- مرحله ۲
Step "مرحله ۲ — ذخیره در قالب قدیمی .doc  (کم‌خطرترین)"
$p1 = Join-Path $tmpDir "a.doc"
$sw.Restart()
try { $doc.SaveAs2($p1, 0, $false, '', $false); OK ("{0:N1} ثانیه — {1:N0} کیلوبایت" -f $sw.Elapsed.TotalSeconds, ((Get-Item $p1).Length/1KB)) }
catch { Bad ("نشد: " + $_.Exception.Message) }

# --------------------------------------------------------------- مرحله ۳
Step "مرحله ۳ — ذخیره در قالب RTF"
$p2 = Join-Path $tmpDir "a.rtf"
$sw.Restart()
try { $doc.SaveAs2($p2, 6, $false, '', $false); OK ("{0:N1} ثانیه" -f $sw.Elapsed.TotalSeconds) }
catch { Bad ("نشد: " + $_.Exception.Message) }

# --------------------------------------------------------------- مرحله ۴
Step "مرحله ۴ — یک‌دست کردن قالب‌بندی کاراکترها (Font.Reset)"
$sw.Restart()
try { $doc.Content.Font.Reset(); OK ("{0:N1} ثانیه" -f $sw.Elapsed.TotalSeconds) }
catch { Bad ("نشد: " + $_.Exception.Message) }

# --------------------------------------------------------------- مرحله ۵
Step "مرحله ۵ — ذخیره در .docx  (مشکوکِ اصلی)"
$p3 = Join-Path $tmpDir "a.docx"
$sw.Restart()
try { $doc.SaveAs2($p3, 16, $false, '', $false); OK ("{0:N1} ثانیه — {1:N0} کیلوبایت" -f $sw.Elapsed.TotalSeconds, ((Get-Item $p3).Length/1KB)) }
catch { Bad ("نشد: " + $_.Exception.Message) }

# --------------------------------------------------------------- پایان
Step "پایان"
try { $doc.Close(0) } catch {}
try { $word.Quit() } catch {}
Remove-Item $tmpDir -Recurse -Force -EA SilentlyContinue
Write-Host "`nهمه‌ی مرحله‌ها رد شد. زمان‌های بالا را بفرستید.`n" -ForegroundColor Green
Read-Host "برای بستن Enter بزنید"
