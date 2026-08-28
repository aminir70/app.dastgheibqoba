#Requires -Version 5.1
<#
===============================================================================
  Format-FiqhBook.ps1
  قالب‌بندی خودکار کتاب‌های فقهی خام Word  (خروجی .docx مرتب + فهرست + پاورقی)

  نویسنده: تولید شده برای پروژه کتابخانه دیجیتال آیت‌الله دستغیب
  نیازمندی: ویندوز + Microsoft Word (2013 یا بالاتر)

  طرز استفاده
  -----------
    ۱) فایل‌های خام (.dot / .doc / .docx) را در پوشه‌ی  input  کنار همین اسکریپت بریزید
    ۲) روی  run.bat  دوبار کلیک کنید
    ۳) خروجی‌ها در پوشه‌ی  output  ساخته می‌شوند

  یا از خط فرمان:
    powershell -ExecutionPolicy Bypass -File .\Format-FiqhBook.ps1 -InputPath "C:\books" -AlsoPdf
===============================================================================
#>

[CmdletBinding()]
param(
    # پوشه یا فایل ورودی. خالی = پوشه input کنار اسکریپت
    [string] $InputPath  = "",
    # پوشه خروجی. خالی = پوشه output کنار اسکریپت
    [string] $OutputPath = "",
    # علاوه بر docx یک PDF هم بساز
    [switch] $AlsoPdf,
    # فهرستِ خامِ اولِ فایل را نگه دار (پیش‌فرض: حذف و ساخت فهرست خودکار ورد)
    [switch] $KeepOriginalIndex,
    # پاورقی‌های انتهای فایل را به پاورقی واقعیِ ورد تبدیل نکن
    [switch] $NoFootnotes,
    # پنجره ورد را کامل نمایش بده (پیش‌فرض: باز ولی مینیمایز)
    [switch] $ShowWord,
    # ورد را کاملاً نامرئی اجرا کن — سریع‌تر است ولی روی بعضی سیستم‌ها
    # عملیات ذخیره پشت یک پنجره‌ی نامرئی قفل می‌کند
    [switch] $HideWord,
    # حتی اگر نمونه‌ی دیگری از Word باز است ادامه بده
    [switch] $Force
)

# خروجی کنسول را UTF-8 کن وگرنه متن فارسی ???? دیده می‌شود
try {
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $OutputEncoding           = [Text.Encoding]::UTF8
} catch {}

# =============================================================================
#  ۱) تنظیمات ظاهری — هرچه لازم بود همین‌جا عوض کنید
# =============================================================================
$CFG = @{
    # --- فونت‌ها ---------------------------------------------------------
    # اسکریپت اولین فونتِ نصب‌شده از این فهرست را برمی‌دارد.
    # اگر فونت PDF را می‌دانید، اسمش را اولِ فهرست بگذارید.
    FontBodyList    = @('Traditional Arabic','Simplified Arabic','Sakkal Majalla','Arabic Typesetting','Amiri','Lotus Linotype','Badr','Mitra','B Mitra','B Lotus','Arial')
    FontHeadList    = @('Traditional Arabic','Sakkal Majalla','Simplified Arabic','Arabic Typesetting','Amiri','B Titr','B Nazanin','Arial')

    # --- اندازه‌ها (pt) ---------------------------------------------------
    # نکته: «Traditional Arabic» ریز رندر می‌شود، اگر فونت را عوض کردید
    #        احتمالاً باید اندازه‌ها را ۲ تا ۴ واحد کم کنید.
    SizeBody        = 16      # متن شرح
    SizeMatn        = 16      # متن مسأله (متنِ عروه)
    SizeQuote       = 15      # روایات و نقل‌قول‌ها
    SizeLabel       = 15      # «الشرح:» و «أقول:»
    SizeH1          = 24      # المبحث / الباب
    SizeH2          = 20      # الفصل
    SizeH3          = 17      # الفرع / الجهة
    SizeTitle       = 30      # صفحه عنوان
    SizeFootnote    = 12      # پاورقی
    SizeHeaderFooter= 11      # سربرگ و پابرگ
    LineSpacing     = 1.15    # فاصله خطوط (ضریب)

    # --- رنگ‌ها (BGR که ورد می‌خواهد؛ از تابع RGB استفاده کنید) ------------
    ColorHead       = @(0,   32,  96)   # سرمه‌ای برای تیترها   (R,G,B)
    ColorMatn       = @(0,    0,   0)   # مشکی برای متن مسأله
    ColorLabel      = @(140, 40,  20)   # زرشکی برای «الشرح:»
    ColorQuote      = @(60,  60,  60)   # خاکستری تیره برای روایات
    ShadeMatn       = @(242, 242, 242)  # زمینه‌ی خاکستریِ خیلی روشن مسأله‌ها
    UseMatnShading  = $true             # $false = بدون زمینه، فقط بولد

    # --- صفحه (سانتی‌متر) -------------------------------------------------
    PageWidth       = 17.0    # قطع وزیری
    PageHeight      = 24.0
    MarginTop       = 2.2
    MarginBottom    = 2.2
    MarginInside    = 2.2     # سمت شیرازه (راست در RTL)
    MarginOutside   = 1.8

    # --- رفتار ------------------------------------------------------------
    HeadingMaxLen   = 70      # بیش از این تعداد کاراکتر، دیگر تیتر حساب نمی‌شود
    TitleMaxLen     = 95      # حداکثر طول خطِ عنوانی که به تیتر بالایش می‌چسبد
    PageBreakOnH1   = $true   # هر «المبحث» از صفحه جدید
    PageBreakOnH2   = $false  # هر «الفصل» از صفحه جدید
    AddTOC          = $true   # فهرست خودکار ورد
    TOCLevels       = 3
    AddHeaderFooter = $true
    PageNumberStyle = 0       # 0 = ۱۲۳ لاتین ، 51 = ١٢٣ عربی‌هندی
    RemoveEmptyParas= $true   # حذف پاراگراف‌های خالیِ فایل خام
    SaveFormat      = 16      # 16 = .docx  |  0 = .doc (اگر ذخیره‌ی docx گیر کرد)
    ConvertCompatMode = $false # ارتقا از «حالت سازگاری» ورد ۹۷.
                               # لازم نیست (docx سالم بدون آن هم ساخته می‌شود)
                               # و روی بعضی سیستم‌ها باعث معلق شدن ورد می‌شود.
    JustifyMode     = 3       # 3=تراز عادی ، 7=کشیده(کشش کامل) ، 5=کشیده متوسط
}

# =============================================================================
#  ۲) ثابت‌های ورد
# =============================================================================
$wdFormatDocx        = 16
$wdExportPDF         = 17
$wdDoNotSaveChanges  = 0
$wdAlertsNone        = 0
$wdStyleTypeParagraph= 1
$wdReadingOrderRtl   = 0    # WdReadingOrder: Rtl=0 ، Ltr=1  (نه 2)
$wdAlignCenter       = 1
$wdAlignRight        = 2
$wdLineSpaceMultiple = 5
$wdReplaceAll        = 2
$wdFindContinue      = 1
$wdFindStop          = 0
$wdFieldPage         = 33
$wdHeaderFooterPrimary = 1
$wdSectionDirectionRtl = 0
$wdOutlineLevelBodyText= 10
$wdArabic            = 1025
$wdFootnoteBottom    = 0
$wdRestartContinuous = 0
# استایل‌های داخلی ورد
$sNormal=-1; $sH1=-2; $sH2=-3; $sH3=-4
$sFootnoteText=-31; $sHeader=-34; $sFooter=-35; $sTOC1=-20; $sTOC2=-21; $sTOC3=-22

# نام استایل‌های سفارشی
$STY = @{
    Title = 'K-عنوان کتاب'
    Body  = 'K-متن'
    Matn  = 'K-متن مسأله'
    Item  = 'K-بند مسأله'
    Quote = 'K-روایت'
    Label = 'K-الشرح'
    List  = 'K-فهرست بخش'
    Head  = 'K-سرفصل'
    Colo  = 'K-خاتمه'
    TocT  = 'K-عنوان فهرست'
}

# =============================================================================
#  ۳) الگوهای تشخیص ساختار (Regex)
# =============================================================================
# «ال» ابتدای واژه اختیاری است چون در بعضی فایل‌ها افتاده («فصل السابع‏عشر»)،
# و بعد از آن باید یک ترتیبی («الأوّل»...) یا «في/فيما» یا عدد بیاید.
$ORD        = '(ال\S+|في\b|فيما\b|[0-9\u0660-\u0669]+)'
$RX_H1      = '^(ال)?(مبحث|باب|قسم|جزء)\s+' + $ORD + '|^(ال)?مقدّ?مة\s*$'
$RX_H2      = '^(ال)?(فصل|مقصد|مقام|مطلب|بحث)\s+' + $ORD
$RX_H3      = '^(ال)?(فرع|جهة|أمر|شرط|تنبيه|خاتمة|تتمّ?ة|فائدة)\s+' + $ORD
$RX_MATN    = '^\(?\s*(مسألة|مسأله|مسئلة|المسألة)\s*[0-9\u0660-\u0669]+\s*\)?\s*[:：]'
$RX_LABEL   = '^(الشرح|شرح|أقول|اقول|الجواب|و الجواب)\s*:\s*$'
$RX_LISTHD  = '^(و\s+)?(يجب\s+)?(فيه|فيها)\s+[^:]{0,30}:\s*$'
$RX_SECLBL  = '^(فروع|فرعان|فرع|مسائل|أمور|امور|تنبيهات|فوائد|جهات)\s*:?\s*$'
$RX_ITEM    = '^«[^»]{1,25}»\s*:'
$RX_QUOTE   = '^[«"”]'
$RX_INDEX   = '[\s\.\u2026/]+[0-9\u0660-\u0669]+\s*$'
$RX_IDXHEAD = '^(الفهرس|الفهرست|فهرس|فهرست|المحتويات|الفهرس العام)\s*$'
$RX_ANNOT   = '(Anotates|Annotates|الهوامش|التعليقات|المصادر)'
$RX_FNDEF   = '^\s*([0-9]{1,5})\s*\)\s*(.*)$'
$RX_COLO    = '^(و\s+)?هذا\s+تمام\s+الكلام'
# کاراکترهای بی‌اثر که باید در مقایسه نادیده گرفته شوند
$RX_INVIS   = '[\u200B-\u200F\u202A-\u202E\u0640]'

# =============================================================================
#  ۴) توابع کمکی
# =============================================================================
function Write-Log {
    param([string]$Msg, [string]$Level = 'INFO')
    $color = switch ($Level) { 'OK'{'Green'} 'WARN'{'Yellow'} 'ERR'{'Red'} default{'Gray'} }
    Write-Host ("  [{0}] {1}" -f $Level.PadRight(4), $Msg) -ForegroundColor $color
}

$script:StepWatch = [Diagnostics.Stopwatch]::StartNew()
function Write-Step {
    param([string]$Msg)
    Write-Host ("  [{0,6:N1}s] {1}" -f $script:StepWatch.Elapsed.TotalSeconds, $Msg) -ForegroundColor DarkCyan
}

function Cm2Pt { param([double]$cm) return [math]::Round($cm * 28.3464567, 2) }

function RGB { param([int]$r,[int]$g,[int]$b) return ($r + ($g * 256) + ($b * 65536)) }

function Get-InstalledFont {
    param([string[]]$Candidates)
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }
    } catch { return $Candidates[0] }
    foreach ($c in $Candidates) { if ($installed -contains $c) { return $c } }
    Write-Log "هیچ‌کدام از فونت‌های پیشنهادی نصب نیست؛ از '$($Candidates[0])' استفاده می‌شود." 'WARN'
    return $Candidates[0]
}

function Get-OrAddStyle {
    param($Doc, [string]$Name)
    try   { return $Doc.Styles.Item($Name) }
    catch { return $Doc.Styles.Add($Name, $wdStyleTypeParagraph) }
}

function Set-StyleLook {
    param(
        $Style, [string]$Font, [double]$Size,
        [bool]$Bold = $false,
        [int]$Align = 3,
        [double]$IndRight = 0, [double]$IndLeft = 0, [double]$FirstLine = 0,
        [double]$SpBefore = 0, [double]$SpAfter = 0,
        [double]$LineMul = 0,
        [bool]$PageBreak = $false, [bool]$KeepNext = $false, [bool]$KeepLines = $true,
        [int]$Outline = 10,
        $Color = $null, $Shade = $null
    )
    $f = $Style.Font
    $f.Name = $Font; $f.NameBi = $Font; $f.NameAscii = $Font; $f.NameOther = $Font
    $f.Size = $Size; $f.SizeBi = $Size
    $f.Bold = [int]$Bold; $f.BoldBi = [int]$Bold
    $f.Italic = 0; $f.ItalicBi = 0
    if ($null -ne $Color) { $f.Color = (RGB $Color[0] $Color[1] $Color[2]) }

    $p = $Style.ParagraphFormat
    $p.ReadingOrder   = $wdReadingOrderRtl
    $p.Alignment      = $Align
    $p.RightIndent    = (Cm2Pt $IndRight)
    $p.LeftIndent     = (Cm2Pt $IndLeft)
    $p.FirstLineIndent= (Cm2Pt $FirstLine)
    $p.SpaceBefore    = $SpBefore
    $p.SpaceAfter     = $SpAfter
    if ($LineMul -gt 0) {
        $p.LineSpacingRule = $wdLineSpaceMultiple
        $p.LineSpacing     = [math]::Round(12 * $LineMul, 2)
    }
    $p.PageBreakBefore = [int]$PageBreak
    $p.KeepWithNext    = [int]$KeepNext
    $p.KeepTogether    = [int]$KeepLines
    $p.WidowControl    = 1
    $p.OutlineLevel    = $Outline
    if ($null -ne $Shade) { $p.Shading.BackgroundPatternColor = (RGB $Shade[0] $Shade[1] $Shade[2]) }
    else { try { $p.Shading.BackgroundPatternColor = -16777216 } catch {} }   # wdColorAutomatic
}

function Invoke-Replace {
    param($Doc, [string]$Find, [string]$Replace, [bool]$Wildcards = $false, [int]$Times = 1)
    for ($k = 0; $k -lt $Times; $k++) {
        $f = $Doc.Content.Find
        $f.ClearFormatting(); $f.Replacement.ClearFormatting()
        # گزینه‌های Find در ورد بین فراخوانی‌ها می‌مانند؛ صریح ست می‌کنیم
        $f.MatchWildcards = $Wildcards
        $f.Format = $false
        $f.Forward = $true
        $f.Wrap = $wdFindContinue
        $null = $f.Execute($Find, $false, $false, $Wildcards, $false, $false,
                           $true, $wdFindContinue, $false, $Replace, $wdReplaceAll)
    }
}

# متن کل سند را تکه‌تکه می‌خواند.
# Range.Text روی بازه‌های خیلی بزرگ گاهی متن ناقص یا null برمی‌گرداند
# (به‌ویژه وقتی نمونه‌ی دیگری از Word فایل را باز نگه داشته باشد).
function Get-DocText {
    param($Doc)
    $total = $Doc.Content.End
    $sb    = New-Object System.Text.StringBuilder
    $pos   = 0
    while ($pos -lt $total) {
        $to = [Math]::Min($pos + 50000, $total)
        $t  = $Doc.Range($pos, $to).Text
        if ($null -eq $t) {
            throw ("ورد متنِ بازه‌ی {0} تا {1} را برنگرداند. " -f $pos, $to +
                   "معمولاً یعنی نمونه‌ی دیگری از Word باز است — همه را از Task Manager ببندید.")
        }
        [void]$sb.Append($t)
        $pos = $to
    }
    return $sb.ToString()
}

# متن پاراگراف‌ها + آفستِ کاراکتریِ هرکدام (برای Range گرفتن سریع)
function Get-Paragraphs {
    param($Doc)
    $txt = Get-DocText $Doc
    if ([Math]::Abs($txt.Length - $Doc.Content.End) -gt 1) {
        throw ("متن ناقص خوانده شد: {0:N0} کاراکتر به‌جای {1:N0}. " -f $txt.Length, $Doc.Content.End +
               "همه‌ی نمونه‌های Word را ببندید و دوباره اجرا کنید.")
    }
    $parts = $txt -split "`r"
    if ($parts.Count -gt 0 -and $parts[$parts.Count-1] -eq '') {
        $parts = $parts[0..($parts.Count-2)]
    }
    # اعتبارسنجی: تعداد پاراگراف‌های شمرده‌شده باید با خودِ ورد بخواند
    $real = $Doc.Paragraphs.Count
    if ([Math]::Abs($parts.Count - $real) -gt 1) {
        throw ("ناسازگاری در شمارش پاراگراف‌ها: {0:N0} در برابر {1:N0} در خود ورد. " -f $parts.Count, $real +
               "همه‌ی نمونه‌های Word را ببندید و دوباره اجرا کنید.")
    }

    $starts = New-Object int[] $parts.Count
    $ends   = New-Object int[] $parts.Count
    $pos = 0
    for ($i = 0; $i -lt $parts.Count; $i++) {
        $starts[$i] = $pos
        $pos += $parts[$i].Length + 1
        $ends[$i]   = $pos
    }
    return [pscustomobject]@{ Text = $parts; Start = $starts; End = $ends; Count = $parts.Count }
}

function Clean-Line {
    param([string]$s)
    if ($null -eq $s) { return '' }
    return ($s -replace $RX_INVIS, '').Trim()
}

# دسته‌بندی پاراگراف‌ها بر اساس الگوهای ساختاری کتاب
function Get-ParagraphClasses {
    param([string[]]$Lines)
    $cls = New-Object string[] $Lines.Count
    $inClist = $false
    $seenHead = $false
    $inColo   = $false
    $firstHeadIdx = -1

    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $s = Clean-Line $Lines[$i]
        if ($s -eq '') { $cls[$i] = 'EMPTY'; continue }

        # خاتمه‌ی کتاب
        if ($inColo) { $cls[$i] = 'COLO'; continue }
        if (($i -ge $Lines.Count - 25) -and ($s -match $RX_COLO)) { $inColo = $true; $cls[$i] = 'COLO'; continue }

        # متن مسأله
        if ($s -match $RX_MATN) { $cls[$i] = 'MATN'; $inClist = $false; continue }

        # برچسب «الشرح:» / «أقول:»
        if ($s -match $RX_LABEL) { $cls[$i] = 'LABEL'; $inClist = $false; continue }

        # سرِ فهرستِ داخل متن: «و فيه فصول:»
        if ($s -match $RX_LISTHD) { $cls[$i] = 'HEAD'; $inClist = $true; continue }
        # برچسب بخش: «فروع:»
        if ($s -match $RX_SECLBL) { $cls[$i] = 'HEAD'; $inClist = $false; continue }

        $isHW = ($s -match $RX_H1) -or ($s -match $RX_H2) -or ($s -match $RX_H3)
        $sFirstLine = ($s -split "[`v`n]")[0]

        # سطرهای فهرستِ داخل متن (لیست فصول یک مبحث) — نباید تیتر شوند.
        # این سطرها عنوان را در همان خط دارند؛ تیتر واقعی در مرحله ۳ دوسطری شده
        # (شکست خط دارد) یا فقط شماره است — پس هر دو از فهرست خارج می‌شوند.
        $isClistRow = $isHW -and ($s -notmatch "`v") -and
                      ($sFirstLine.Length -gt 22 -or $s -match '\sفي(ما)?\s')
        if ($inClist -and $isClistRow) { $cls[$i] = 'CLIST'; continue }
        $inClist = $false

        # تیترها
        if ($isHW -and $sFirstLine.Length -le $CFG.HeadingMaxLen -and $s -notmatch '[،؛\.]\s*$') {
            if     ($s -match $RX_H1) { $cls[$i] = 'H1' }
            elseif ($s -match $RX_H2) { $cls[$i] = 'H2' }
            else                      { $cls[$i] = 'H3' }
            if ($firstHeadIdx -lt 0) { $firstHeadIdx = $i }
            $seenHead = $true
            continue
        }

        # بندهای شماره‌دارِ متن: «الأوّل»: ...
        if ($s -match $RX_ITEM)  { $cls[$i] = 'ITEM';  continue }
        # روایات و نقل‌قول‌ها
        if ($s -match $RX_QUOTE) { $cls[$i] = 'QUOTE'; continue }

        # صفحه عنوان (قبل از اولین تیتر)
        if (-not $seenHead -and $i -lt 12) { $cls[$i] = 'TITLE'; continue }

        $cls[$i] = 'BODY'
    }

    # --- پس‌پردازش: متنِ عروه که پیش از «الشرح:» می‌آید هم متنِ مسأله است ---
    # (فقط «الشرح»؛ «أقول:» بعد از بحثِ خودِ شارح می‌آید نه بعد از متن)
    for ($i = 1; $i -lt $Lines.Count; $i++) {
        if ($cls[$i] -ne 'LABEL') { continue }
        if ((Clean-Line $Lines[$i]) -notmatch '^(الشرح|شرح)\s*:') { continue }
        for ($j = $i - 1; ($j -ge 0) -and (($i - $j) -le 6); $j--) {
            if ($cls[$j] -ne 'BODY') { break }
            $cls[$j] = 'MATN'
        }
    }

    return [pscustomobject]@{ Classes = $cls; FirstHead = $firstHeadIdx }
}

# =============================================================================
#  ۵) پردازش یک کتاب
# =============================================================================
function Convert-Book {
    param($Word, [string]$SrcPath, [string]$OutDir)

    $name = [IO.Path]::GetFileNameWithoutExtension($SrcPath)
    $ext  = [IO.Path]::GetExtension($SrcPath).ToLower()
    $dstExt = if ($CFG.SaveFormat -eq 0) { '.doc' } else { '.docx' }
    $dst  = Join-Path $OutDir ($name + $dstExt)

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor DarkCyan
    Write-Host ("  " + $name) -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor DarkCyan

    $script:StepWatch.Restart()

    # --- برداشتن قفل «فایل از اینترنت» --------------------------------------
    # اگر فایل دانلود یا ایمیل شده باشد ویندوز آن را علامت می‌زند و ورد در
    # «Protected View» بازش می‌کند؛ در حالت نامرئی همان‌جا قفل می‌کند.
    try { Unblock-File -Path $SrcPath -ErrorAction SilentlyContinue } catch {}

    # --- باز کردن ---------------------------------------------------------
    Write-Step "در حال باز کردن فایل با Word ..."
    $doc = $null
    if ($ext -in @('.dot', '.dotx', '.dotm')) {
        # از روی قالب یک سند تازه می‌سازیم تا فایل اصلی دست‌نخورده بماند.
        # آرگومان چهارم Visible است و به سند پنجره می‌دهد — نه به خودِ ورد.
        # با $false سند «بی‌پنجره» ساخته می‌شود و SaveAs روی آن قفل می‌کند.
        # خودِ برنامه‌ی ورد همچنان نامرئی است، پس چیزی روی صفحه ظاهر نمی‌شود.
        try { $doc = $Word.Documents.Add($SrcPath, $false, 0, $true) }
        catch { Write-Log ("Documents.Add نشد: {0}" -f $_.Exception.Message) 'WARN'; $doc = $null }
        if ($null -ne $doc -and $doc.Content.End -lt 100) {
            # قالب محتوایش را منتقل نکرد؛ خود فایل را باز می‌کنیم
            $doc.Close($wdDoNotSaveChanges); $doc = $null
        }
    }
    if ($null -eq $doc) {
        Write-Step "با Documents.Open باز می‌کنیم ..."
        $doc = $Word.Documents.Open($SrcPath, $false, $false, $false)
    }
    Write-Step ("باز شد — {0:N0} کاراکتر، {1} پنجره" -f $doc.Content.End, $doc.Windows.Count)
    # حالا که سند پنجره دارد، دوباره مینیمایز کن تا جلوی چشم نباشد
    if (-not $ShowWord -and -not $HideWord) { try { $Word.WindowState = 2 } catch {} }
    if ($doc.Windows.Count -eq 0) {
        # بدون پنجره، SaveAs قفل می‌کند — یکی می‌سازیم
        Write-Log "سند پنجره نداشت؛ یک پنجره ساخته شد." 'WARN'
        $null = $doc.ActiveWindow
    }

    Write-Step "خاموش کردن بازبینی املا و گرامر ..."
    $doc.TrackRevisions = $false
    # به ورد بگو سند قبلاً بازبینی شده؛ وگرنه روی ۷۳۰ هزار کاراکترِ عربی
    # بازبینی پس‌زمینه راه می‌افتد و اجرا عملاً معلق می‌شود.
    try { $doc.SpellingChecked = $true } catch {}
    try { $doc.GrammarChecked  = $true } catch {}
    try { $doc.ShowSpellingErrors = $false } catch {}
    try { $doc.ShowGrammaticalErrors = $false } catch {}
    try { $doc.Application.Options.Pagination = $false } catch {}

    # قالبِ .dot را از سند جدا کن؛ وگرنه هنگام ذخیره در قالب بدون‌ماکرو
    # ورد ممکن است درباره‌ی پروژه‌ی VBAی داخل قالب سؤال بپرسد.
    try { $doc.AttachedTemplate = $Word.NormalTemplate.FullName } catch {}

    # فایل خام هیچ قالب‌بندی کاراکتری ندارد؛ یک‌دست کردنش قبل از پردازش،
    # ساختار run های سند را سالم می‌کند و ذخیره‌ی نهایی را سبک نگه می‌دارد.
    Write-Step "یک‌دست کردن قالب‌بندی کاراکترها ..."
    try { $doc.Content.Font.Reset() } catch {}
    Write-Step "آماده‌ی پردازش"

    # نکته: ذخیره فقط یک بار و در انتهای کار انجام می‌شود.

    # --- زبان و جهت کلی ---------------------------------------------------
    $doc.Content.LanguageIDOther = $wdArabic
    $doc.Content.ParagraphFormat.ReadingOrder = $wdReadingOrderRtl

    # =====================================================================
    #  مرحله ۱ — خواندن ساختار، جدا کردن پاورقی‌ها و فهرستِ خام
    # =====================================================================
    $P = Get-Paragraphs $doc
    Write-Log ("تعداد پاراگراف خام: {0}" -f $P.Count)

    # --- ۱-الف: بخش پاورقی‌ها در انتهای فایل ---
    $annotIdx = -1
    for ($i = $P.Count - 1; $i -ge [math]::Max(0, $P.Count - 4000); $i--) {
        if ((Clean-Line $P.Text[$i]) -match $RX_ANNOT) { $annotIdx = $i; break }
    }
    $footnotes = @{}
    $fnMax = 0
    if ($annotIdx -ge 0 -and -not $NoFootnotes) {
        $lastNum = 0
        for ($i = $annotIdx + 1; $i -lt $P.Count; $i++) {
            $s = Clean-Line $P.Text[$i]
            if ($s -eq '') { continue }
            $m = [regex]::Match($s, $RX_FNDEF)
            if ($m.Success) {
                $lastNum = [int]$m.Groups[1].Value
                $footnotes[$lastNum] = $m.Groups[2].Value.Trim()
                if ($lastNum -gt $fnMax) { $fnMax = $lastNum }
            } elseif ($lastNum -gt 0) {
                $footnotes[$lastNum] = ($footnotes[$lastNum] + ' ' + $s).Trim()
            }
        }
        Write-Log ("متن {0} پاورقی از انتهای فایل استخراج شد" -f $footnotes.Count)
    } elseif ($annotIdx -lt 0) {
        Write-Log "بخش پاورقی (Anotates) پیدا نشد — از این مرحله می‌گذریم" 'WARN'
    }

    # --- ۱-ب: بلوک فهرستِ خام ---
    $idxStart = -1; $idxEnd = -1
    for ($i = 0; $i -lt [math]::Min($P.Count, 60); $i++) {
        if ((Clean-Line $P.Text[$i]) -match $RX_IDXHEAD) { $idxStart = $i; break }
    }
    if ($idxStart -ge 0) {
        $miss = 0; $last = $idxStart
        for ($i = $idxStart + 1; $i -lt $P.Count; $i++) {
            $s = Clean-Line $P.Text[$i]
            if ($s -eq '') { continue }
            if ($s -match $RX_INDEX) { $last = $i; $miss = 0 }
            else { $miss++; if ($miss -ge 3) { break } }
        }
        $idxEnd = $last
        Write-Log ("فهرست خام: پاراگراف {0} تا {1}" -f $idxStart, $idxEnd)
    }

    # --- ۱-ج: حذف (اول انتهای سند، بعد ابتدای سند تا آفست‌ها به‌هم نریزد) ---
    if ($annotIdx -ge 0) {
        $doc.Range($P.Start[$annotIdx], $doc.Content.End).Delete() | Out-Null
        Write-Log "بخش خام پاورقی‌ها از متن حذف شد"
    }
    if ($idxStart -ge 0 -and -not $KeepOriginalIndex) {
        $doc.Range($P.Start[$idxStart], $P.End[$idxEnd]).Delete() | Out-Null
        Write-Log "فهرست خام حذف شد (به‌جایش فهرست خودکار ساخته می‌شود)"
    }

    # =====================================================================
    #  مرحله ۲ — پاک‌سازی متن
    # =====================================================================
    Write-Step "پاک‌سازی فاصله‌ها و پاراگراف‌های خالی ..."
    # بدون wildcard انجام می‌شود: ورد الگوی ^13 را در حالت wildcard رد می‌کند.
    # هر بار یک فاصله برداشته می‌شود، پس چند بار تکرار می‌کنیم.
    Invoke-Replace $doc "^p " "^p" $false 8          # فاصله ابتدای پاراگراف
    Invoke-Replace $doc " ^p" "^p" $false 8          # فاصله انتهای پاراگراف
    Invoke-Replace $doc "  "  " "  $false 8          # فاصله‌های تکراری وسط خط
    Invoke-Replace $doc " ،" "،" $false 1
    Invoke-Replace $doc " ." "." $false 1
    if ($CFG.RemoveEmptyParas) { Invoke-Replace $doc "^p^p" "^p" $false 14 }

    # فاصله‌های ابتدای اولین پاراگراف که علامت پاراگراف قبلش ندارد
    $head = $doc.Range(0, [Math]::Min(60, $doc.Content.End)).Text
    if ($head) {
        $lead = 0
        while ($lead -lt $head.Length -and $head[$lead] -eq ' ') { $lead++ }
        if ($lead -gt 0) { $doc.Range(0, $lead).Delete() | Out-Null }
    }
    Write-Log "فاصله‌ها و پاراگراف‌های خالی پاک‌سازی شد"

    # =====================================================================
    #  مرحله ۳ — چسباندن خطِ عنوان به تیتر بالایش
    #     «الفصل الأوّل»  +  «في غسل مسّ الميّت»  →  یک تیتر دو سطری
    #     (از آخر به اول، تا شماره پاراگراف‌ها به‌هم نریزد)
    # =====================================================================
    Write-Step "چسباندن خط عنوان به تیترها ..."
    $P = Get-Paragraphs $doc
    $merged = 0
    for ($i = $P.Count - 2; $i -ge 0; $i--) {
        $a = Clean-Line $P.Text[$i]
        $b = Clean-Line $P.Text[$i + 1]
        if ($a -eq '' -or $b -eq '') { continue }
        $isHeadLabel = (($a -match $RX_H1) -or ($a -match $RX_H2) -or ($a -match $RX_H3)) -and ($a.Length -le 32)
        if (-not $isHeadLabel) { continue }
        if ($b.Length -gt $CFG.TitleMaxLen) { continue }
        if ($b -notmatch '^(في|فيما|فى|في‏)') { continue }
        if ($b -match $RX_MATN -or $b -match $RX_LABEL) { continue }
        # علامت پاراگراف پاراگرافِ تیتر را با «شکست خط» عوض می‌کنیم
        $mark = $doc.Range($P.End[$i] - 1, $P.End[$i])
        $mark.Text = [string][char]11
        $merged++
    }
    Write-Log ("{0} خطِ عنوان به تیتر بالایش چسبانده شد" -f $merged)

    # =====================================================================
    #  مرحله ۴ — ساخت استایل‌ها
    # =====================================================================
    Write-Step "ساخت استایل‌ها ..."
    $fB = Get-InstalledFont $CFG.FontBodyList
    $fH = Get-InstalledFont $CFG.FontHeadList
    Write-Log ("فونت متن: {0}   |   فونت تیتر: {1}" -f $fB, $fH)

    $J = $CFG.JustifyMode
    $LS = $CFG.LineSpacing

    Set-StyleLook -Style $doc.Styles.Item($sNormal) -Font $fB -Size $CFG.SizeBody -Align $J -LineMul $LS

    Set-StyleLook -Style $doc.Styles.Item($sH1) -Font $fH -Size $CFG.SizeH1 -Bold $true `
        -Align $wdAlignCenter -SpBefore 24 -SpAfter 20 -LineMul 1.0 `
        -PageBreak $CFG.PageBreakOnH1 -KeepNext $true -Outline 1 -Color $CFG.ColorHead

    Set-StyleLook -Style $doc.Styles.Item($sH2) -Font $fH -Size $CFG.SizeH2 -Bold $true `
        -Align $wdAlignCenter -SpBefore 20 -SpAfter 14 -LineMul 1.0 `
        -PageBreak $CFG.PageBreakOnH2 -KeepNext $true -Outline 2 -Color $CFG.ColorHead

    Set-StyleLook -Style $doc.Styles.Item($sH3) -Font $fH -Size $CFG.SizeH3 -Bold $true `
        -Align $wdAlignCenter -SpBefore 14 -SpAfter 10 -LineMul 1.0 `
        -KeepNext $true -Outline 3 -Color $CFG.ColorHead

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Title) -Font $fH -Size $CFG.SizeTitle -Bold $true `
        -Align $wdAlignCenter -SpBefore 40 -SpAfter 24 -LineMul 1.0 -Color $CFG.ColorHead

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Body) -Font $fB -Size $CFG.SizeBody `
        -Align $J -FirstLine 0.7 -SpAfter 4 -LineMul $LS

    $shade = $null; if ($CFG.UseMatnShading) { $shade = $CFG.ShadeMatn }
    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Matn) -Font $fB -Size $CFG.SizeMatn -Bold $true `
        -Align $J -IndRight 0.35 -IndLeft 0.35 -SpBefore 10 -SpAfter 6 -LineMul $LS `
        -KeepNext $true -Color $CFG.ColorMatn -Shade $shade

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Item) -Font $fB -Size $CFG.SizeMatn -Bold $true `
        -Align $J -IndRight 0.9 -IndLeft 0.35 -FirstLine -0.55 -SpBefore 4 -SpAfter 4 -LineMul $LS `
        -Color $CFG.ColorMatn -Shade $shade

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Quote) -Font $fB -Size $CFG.SizeQuote `
        -Align $J -IndRight 0.9 -IndLeft 0.5 -SpBefore 3 -SpAfter 3 -LineMul 1.05 -Color $CFG.ColorQuote

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Label) -Font $fH -Size $CFG.SizeLabel -Bold $true `
        -Align $wdAlignRight -SpBefore 8 -SpAfter 2 -LineMul 1.0 -KeepNext $true -Color $CFG.ColorLabel

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Head) -Font $fH -Size $CFG.SizeH3 -Bold $true `
        -Align $wdAlignCenter -SpBefore 12 -SpAfter 8 -LineMul 1.0 -KeepNext $true -Color $CFG.ColorHead

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.List) -Font $fB -Size $CFG.SizeBody `
        -Align $wdAlignCenter -SpAfter 2 -LineMul 1.0

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.Colo) -Font $fH -Size $CFG.SizeH3 -Bold $true `
        -Align $wdAlignCenter -SpBefore 8 -SpAfter 8 -LineMul 1.0 -Color $CFG.ColorHead

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.TocT) -Font $fH -Size $CFG.SizeH1 -Bold $true `
        -Align $wdAlignCenter -SpBefore 12 -SpAfter 20 -LineMul 1.0 -PageBreak $true -Color $CFG.ColorHead

    Set-StyleLook -Style $doc.Styles.Item($sFootnoteText) -Font $fB -Size $CFG.SizeFootnote -Align $J -LineMul 1.0
    Set-StyleLook -Style $doc.Styles.Item($sHeader) -Font $fH -Size $CFG.SizeHeaderFooter -Align $wdAlignCenter -LineMul 1.0
    Set-StyleLook -Style $doc.Styles.Item($sFooter) -Font $fH -Size $CFG.SizeHeaderFooter -Align $wdAlignCenter -LineMul 1.0
    foreach ($ts in @($sTOC1, $sTOC2, $sTOC3)) {
        try { Set-StyleLook -Style $doc.Styles.Item($ts) -Font $fB -Size ($CFG.SizeBody - 2) -Align $wdAlignRight -LineMul 1.0 } catch {}
    }
    Write-Log "استایل‌ها ساخته شد"

    # =====================================================================
    #  مرحله ۵ — دسته‌بندی پاراگراف‌ها و اعمال استایل
    # =====================================================================
    $P = Get-Paragraphs $doc
    $R   = Get-ParagraphClasses -Lines $P.Text
    $cls = $R.Classes
    $firstHeadIdx = $R.FirstHead

    $styleOf = @{
        'TITLE' = $STY.Title; 'BODY' = $STY.Body;  'MATN' = $STY.Matn;  'ITEM' = $STY.Item
        'QUOTE' = $STY.Quote; 'LABEL'= $STY.Label; 'HEAD' = $STY.Head;  'CLIST'= $STY.List
        'COLO'  = $STY.Colo;  'EMPTY'= $STY.Body
        'H1' = $sH1; 'H2' = $sH2; 'H3' = $sH3
    }

    # اعمال استایل به‌صورت «بازه‌ای» (سریع‌تر از پاراگراف‌به‌پاراگراف)
    if ($P.Count -eq 0) { throw 'سند خالی است.' }
    Write-Step ("اعمال استایل روی {0:N0} پاراگراف ..." -f $P.Count)
    $applied = 0
    $runStart = 0
    for ($i = 0; $i -le $P.Count; $i++) {
        $isEnd = ($i -eq $P.Count)
        if ($isEnd -or ($cls[$i] -ne $cls[$runStart])) {
            $c = $cls[$runStart]
            $rng = $doc.Range($P.Start[$runStart], $P.End[$i - 1])
            try { $rng.Style = $styleOf[$c] } catch { Write-Log ("استایل '{0}' اعمال نشد" -f $c) 'WARN' }
            $applied++
            $runStart = $i
        }
    }
    $stat = ($cls | Group-Object | Sort-Object Count -Descending |
             ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }) -join '  '
    Write-Log ("استایل‌ها اعمال شد ({0} بازه)" -f $applied)
    Write-Log ("آمار: {0}" -f $stat)

    # =====================================================================
    #  مرحله ۶ — تبدیل ارجاع‌های (۱) به پاورقی واقعی
    # =====================================================================
    if ($footnotes.Count -gt 0) {
        Write-Step ("ساخت {0:N0} پاورقی (طولانی‌ترین مرحله) ..." -f $footnotes.Count)
        $doc.Footnotes.Location      = $wdFootnoteBottom
        $doc.Footnotes.NumberingRule = $wdRestartContinuous
        $doc.Footnotes.StartingNumber = 1

        $pos = 0
        $done = 0; $skipped = 0
        for ($n = 1; $n -le $fnMax; $n++) {
            if (-not $footnotes.ContainsKey($n)) { $skipped++; continue }
            $rng = $doc.Range($pos, $doc.Content.End)
            $f = $rng.Find
            $f.ClearFormatting()
            $f.MatchWildcards = $false      # گزینه‌های Find در ورد چسبنده‌اند
            $f.Format = $false
            $found = $f.Execute("($n)", $false, $false, $false, $false, $false,
                                $true, $wdFindStop, $false)
            if (-not $found) { $skipped++; continue }
            $at = $rng.Start
            $rng.Text = ''                       # حذف «(۱)»
            $ref = $doc.Range($at, $at)
            $fn  = $doc.Footnotes.Add($ref)
            $fn.Range.Text = $footnotes[$n]
            $pos = $at + 1
            $done++
            if ($done % 200 -eq 0) { Write-Host ("      ... {0} پاورقی" -f $done) -ForegroundColor DarkGray }
        }
        Write-Log ("{0} پاورقی ساخته شد (ناموفق: {1})" -f $done, $skipped) $(if ($skipped -gt 0) {'WARN'} else {'OK'})
    }

    # =====================================================================
    #  مرحله ۷ — صفحه‌آرایی، سربرگ/پابرگ، فهرست خودکار
    # =====================================================================
    Write-Step "صفحه‌آرایی، سربرگ و فهرست ..."
    $sec = $doc.Sections.Item(1)
    $ps  = $sec.PageSetup
    try { $ps.SectionDirection = $wdSectionDirectionRtl } catch {}
    $ps.PageWidth    = (Cm2Pt $CFG.PageWidth)
    $ps.PageHeight   = (Cm2Pt $CFG.PageHeight)
    $ps.TopMargin    = (Cm2Pt $CFG.MarginTop)
    $ps.BottomMargin = (Cm2Pt $CFG.MarginBottom)
    $ps.RightMargin  = (Cm2Pt $CFG.MarginInside)
    $ps.LeftMargin   = (Cm2Pt $CFG.MarginOutside)
    $ps.MirrorMargins = $true
    $ps.DifferentFirstPageHeaderFooter = $true

    # عنوان کتاب = اولین پاراگراف غیرخالی
    $bookTitle = $name
    foreach ($t in $P.Text) { $c = Clean-Line $t; if ($c -ne '') { $bookTitle = ($c -split "[`v`n]")[0]; break } }

    if ($CFG.AddHeaderFooter) {
        $hdr = $sec.Headers.Item($wdHeaderFooterPrimary)
        $hdr.Range.Text = $bookTitle
        $hdr.Range.Style = $doc.Styles.Item($sHeader)
        $hdr.Range.ParagraphFormat.ReadingOrder = $wdReadingOrderRtl
        $hdr.Range.ParagraphFormat.Alignment = $wdAlignCenter
        try { $hdr.Range.Borders.Item(-3).LineStyle = 1 } catch {}   # wdBorderBottom

        $ftr = $sec.Footers.Item($wdHeaderFooterPrimary)
        $ftr.Range.Text = ''
        $ftr.Range.Style = $doc.Styles.Item($sFooter)
        $ftr.Range.ParagraphFormat.Alignment = $wdAlignCenter
        $null = $ftr.Range.Fields.Add($ftr.Range, $wdFieldPage)
        try { $ftr.PageNumbers.NumberStyle = $CFG.PageNumberStyle } catch {}
        Write-Log "سربرگ و شماره صفحه اضافه شد"
    }

    if ($CFG.AddTOC) {
        # جای فهرست: درست قبل از اولین تیترِ واقعی (بعد از صفحه عنوان)
        # پاورقی‌ها پاراگراف جدید نمی‌سازند، پس اندیس‌های مرحله ۵ هنوز معتبرند.
        $Q = Get-Paragraphs $doc
        $anchor = 0
        if ($firstHeadIdx -ge 0 -and $firstHeadIdx -lt $Q.Count) { $anchor = $Q.Start[$firstHeadIdx] }
        $head = 'الفهرس'
        $r = $doc.Range($anchor, $anchor)
        $r.InsertBefore($head + [string][char]13)
        $doc.Range($anchor, $anchor + $head.Length + 1).Style = $doc.Styles.Item($STY.TocT)

        $tocAt = $anchor + $head.Length + 1
        $tr = $doc.Range($tocAt, $tocAt)
        $toc = $doc.TablesOfContents.Add($tr, $true, 1, $CFG.TOCLevels,
                                         $false, '', $true, $true, '', $true, $true, $true)
        Write-Log "فهرست خودکار ساخته شد"
    }

    # =====================================================================
    #  مرحله ۸ — به‌روزرسانی و ذخیره
    # =====================================================================
    Write-Step "به‌روزرسانی فهرست و ذخیره نهایی ..."
    try { $doc.Application.Options.Pagination = $true } catch {}
    try { $doc.Fields.Update() | Out-Null } catch {}
    try { if ($doc.TablesOfContents.Count -gt 0) { $doc.TablesOfContents.Item(1).Update() } } catch {}
    try { $doc.Repaginate() } catch {}

    if (Test-Path $dst) { Remove-Item $dst -Force }
    Write-Step ("ذخیره در {0} ..." -f $dst)
    try   { $doc.SaveAs2($dst, $CFG.SaveFormat, $false, '', $false) }
    catch { $doc.SaveAs($dst,  $CFG.SaveFormat, $false, '', $false) }
    Write-Log ("ذخیره شد: {0}  ({1} صفحه)" -f $dst, $doc.ComputeStatistics(2)) 'OK'

    if ($AlsoPdf) {
        $pdf = Join-Path $OutDir ($name + '.pdf')
        $doc.ExportAsFixedFormat($pdf, $wdExportPDF)
        Write-Log ("PDF ساخته شد: {0}" -f $pdf) 'OK'
    }

    $doc.Close($wdDoNotSaveChanges)
}

# =============================================================================
#  ۶) اجرای اصلی
# =============================================================================
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RX_WORD = '^\.(dot|dotx|dotm|doc|docx|docm)$'

function Get-WordFiles {
    param([string]$Dir)
    if (-not (Test-Path $Dir)) { return @() }
    return @(Get-ChildItem -Path $Dir -File -ErrorAction SilentlyContinue |
             Where-Object { $_.Extension -match $RX_WORD } | Sort-Object Name)
}

# اگر ورودی داده نشده: اول پوشه‌ی input، وگرنه خودِ پوشه‌ی اسکریپت
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    $dirInput = Join-Path $root 'input'
    if ((Get-WordFiles $dirInput).Count -gt 0) {
        $InputPath = $dirInput
    } elseif ((Get-WordFiles $root).Count -gt 0) {
        $InputPath = $root
        Write-Host "`nفایل‌های ورد کنار خودِ اسکریپت پیدا شدند؛ از همین پوشه خوانده می‌شود." -ForegroundColor Yellow
    } else {
        $InputPath = $dirInput
    }
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $root 'output' }

if (-not (Test-Path $InputPath)) {
    New-Item -ItemType Directory -Path $InputPath -Force | Out-Null
    Write-Host "`nپوشه‌ی ورودی ساخته شد: $InputPath" -ForegroundColor Yellow
    Write-Host "فایل‌های .dot / .doc / .docx را داخل آن (یا کنار خود اسکریپت) بریزید و دوباره اجرا کنید.`n" -ForegroundColor Yellow
    return
}

if (Test-Path $InputPath -PathType Leaf) { $files = @(Get-Item $InputPath) }
else                                     { $files = Get-WordFiles $InputPath }

if ($files.Count -eq 0) {
    Write-Host "`nهیچ فایل وردی (.dot/.doc/.docx) در این مسیر پیدا نشد:" -ForegroundColor Red
    Write-Host "   $InputPath" -ForegroundColor Red
    Write-Host "فایل‌ها را داخل این پوشه یا کنار خودِ اسکریپت بگذارید.`n" -ForegroundColor Yellow
    return
}

if (-not (Test-Path $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }

Write-Host ""
Write-Host "  تعداد فایل: $($files.Count)" -ForegroundColor White
Write-Host "  خروجی    : $OutputPath" -ForegroundColor White

# نمونه‌های باز مانده را قبل از ساختن نمونه‌ی خودمان بشمار.
# یک نمونه‌ی گیرکرده فایل را باز نگه می‌دارد و باعث می‌شود ورد متن ناقص بدهد.
$stuck = @(Get-Process WINWORD -ErrorAction SilentlyContinue)
if ($stuck.Count -gt 0 -and -not $Force) {
    Write-Host ("`n  {0} نمونه‌ی Word از قبل باز است (PID: {1})." -f `
                $stuck.Count, ($stuck.Id -join ', ')) -ForegroundColor Red
    Write-Host "  تا وقتی این‌ها باز باشند، ورد ممکن است متن ناقص برگرداند." -ForegroundColor Yellow
    Write-Host "  همه‌ی پنجره‌های Word را ببندید (یا در Task Manager به WINWORD.EXE پایان دهید)." -ForegroundColor Yellow
    Write-Host "  برای بستن خودکارشان B و بعد Enter بزنید، یا فقط Enter برای ادامه." -ForegroundColor Yellow
    $ans = Read-Host "  انتخاب"
    if ($ans -match '^[bBبی]') {
        $stuck | ForEach-Object { try { $_.Kill() } catch {} }
        Start-Sleep -Seconds 2
        Write-Host "  بسته شدند.`n" -ForegroundColor Green
    }
}

$word = $null
try {
    $word = New-Object -ComObject Word.Application
} catch {
    Write-Host "`nMicrosoft Word نصب نیست یا قابل اجرا نیست.`n" -ForegroundColor Red
    return
}

# ورد را باز ولی مینیمایز اجرا می‌کنیم.
# در حالت کاملاً نامرئی، اگر ورد بخواهد پنجره‌ای نشان دهد (مثلاً هنگام ذخیره)
# آن پنجره دیده نمی‌شود و اجرا برای همیشه قفل می‌ماند.
$word.Visible = -not $HideWord
if ($word.Visible -and -not $ShowWord) {
    try { $word.WindowState = 2 } catch {}      # wdWindowStateMinimize
}
$word.DisplayAlerts = $wdAlertsNone
# ماکروهای داخل قالب را کامل غیرفعال کن (msoAutomationSecurityForceDisable)
# وگرنه یک ماکروی AutoNew/AutoOpen می‌تواند اجرا را برای همیشه معلق کند.
try { $word.AutomationSecurity = 3 } catch {}
try { $word.Options.ConfirmConversions      = $false } catch {}
try { $word.Options.Pagination              = $false } catch {}
try { $word.Options.CheckSpellingAsYouType  = $false } catch {}
try { $word.Options.CheckGrammarAsYouType   = $false } catch {}
try { $word.Options.SaveInterval            = 0      } catch {}
try { $word.Options.AnimateScreenMovements  = $false } catch {}
# ScreenUpdating را عمداً خاموش نمی‌کنیم: ترکیب آن با پنجره‌ی نامرئی
# باعث قفل شدن SaveAs می‌شود و وقتی پنجره مینیمایز است سودی هم ندارد.
$swAll = [Diagnostics.Stopwatch]::StartNew()
$ok = 0; $fail = 0

foreach ($f in $files) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        Convert-Book -Word $word -SrcPath $f.FullName -OutDir $OutputPath
        $ok++
        Write-Log ("زمان: {0:N1} ثانیه" -f $sw.Elapsed.TotalSeconds)
    } catch {
        $fail++
        Write-Log ("خطا در '{0}': {1}" -f $f.Name, $_.Exception.Message) 'ERR'
        while ($word.Documents.Count -gt 0) {
            try { $word.Documents.Item(1).Close($wdDoNotSaveChanges) } catch { break }
        }
    }
}

$word.Quit()
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
[GC]::Collect(); [GC]::WaitForPendingFinalizers()

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host ("  تمام شد — موفق: {0}   ناموفق: {1}   زمان کل: {2:N1} دقیقه" -f `
            $ok, $fail, $swAll.Elapsed.TotalMinutes) -ForegroundColor Green
Write-Host ("  خروجی‌ها: {0}" -f $OutputPath) -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host ""
