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
    [switch] $Force,
    # ذخیره نکن: سند را آماده در Word باز بگذار تا خودتان Ctrl+S بزنید.
    # روی سیستم‌هایی که ذخیره‌ی خودکارِ Word گیر می‌کند، این تنها راه است.
    [switch] $NoSave
)

# خروجی کنسول را UTF-8 کن وگرنه متن فارسی ???? دیده می‌شود
try {
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $OutputEncoding           = [Text.Encoding]::UTF8
} catch {}

$SCRIPT_VERSION = 'v18 (1405/06/09)'

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
    RemoveEmptyParas= $false  # حذف واقعیِ پاراگراف‌های خالی (هزاران فراخوانی
                              # به ورد؛ خاموش که باشد به‌جایش با استایلی به
                              # ارتفاع ۱ نقطه عملاً نامرئی می‌شوند — سریع‌تر
                              # و بدون هیچ ریسکی)
    UseFindReplace  = $false  # پاک‌سازی فاصله‌ها با Find/Replace ورد.
                              # روی بعضی سیستم‌ها Find باعث بی‌پاسخ شدن ورد
                              # می‌شود؛ خاموش که باشد فقط پاراگراف‌های خالی
                              # حذف می‌شوند (با روش مستقیم و مطمئن).
    NormalizeFonts  = $false  # اجرای Font.Reset روی کل سند پیش از پردازش.
                              # عملیات سنگینی است و ورد را مدتی مشغول می‌کند.
    SaveEarly       = $true   # بعد از اعمال استایل‌ها یک بار ذخیره کن، تا اگر
                              # مرحله‌ی پاورقی‌ها به مشکل خورد فایل از دست نرود
    # قالب ذخیره:  0 = .doc  |  16 = .docx
    # پیش‌فرض .doc است چون فایل ورودی خودش قالب Word 97 است و ذخیره در همان
    # قالب هیچ تبدیلی لازم ندارد؛ تبدیل به .docx روی بعضی سیستم‌ها گیر می‌کند.
    # فایل .doc همه‌ی قالب‌بندی، پاورقی و فهرست را دارد و با هر ورژنی باز می‌شود.
    SaveFormat      = 0
    AlsoDocx        = $false  # بعد از .doc یک نسخه‌ی .docx هم بساز (ممکن است کند باشد)
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
    Empty = 'K-خالی'
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
#  ۳.۵) OLE Message Filter — راه‌حل رسمی مایکروسافت برای RPC_E_CALL_REJECTED
# -----------------------------------------------------------------------------
#  ورد یک سرور COM تک‌نخی است. وقتی مشغول است فراخوانی تازه را رد می‌کند و
#  خطای «Call was rejected by callee» می‌دهد. تکرار در سطح PowerShell کافی
#  نیست، چون خودِ فراخوانی از قبل شکست خورده. با ثبت یک Message Filter،
#  ویندوز فراخوانیِ رد شده را در سطح COM و پیش از رسیدن خطا به ما، خودکار
#  دوباره می‌فرستد.
# =============================================================================
function Register-ComRetryFilter {
    if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') {
        Write-Log "PowerShell در حالت STA نیست؛ فیلتر COM ثبت نمی‌شود." 'WARN'
        return $false
    }
    if (-not ('ComRetryFilter' -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("00000016-0000-0000-C000-000000000046"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IOleMessageFilter {
    [PreserveSig] int HandleInComingCall(int dwCallType, IntPtr hTaskCaller,
                                         int dwTickCount, IntPtr lpInterfaceInfo);
    [PreserveSig] int RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType);
    [PreserveSig] int MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType);
}

public class ComRetryFilter : IOleMessageFilter {
    [DllImport("Ole32.dll")]
    private static extern int CoRegisterMessageFilter(IOleMessageFilter newFilter,
                                                      out IOleMessageFilter oldFilter);
    public static int TimeoutMs = 120000;

    public static void Register() {
        IOleMessageFilter old = null;
        CoRegisterMessageFilter(new ComRetryFilter(), out old);
    }
    public static void Revoke() {
        IOleMessageFilter old = null;
        CoRegisterMessageFilter(null, out old);
    }
    int IOleMessageFilter.HandleInComingCall(int dwCallType, IntPtr hTaskCaller,
                                             int dwTickCount, IntPtr lpInterfaceInfo) {
        return 0;                       // SERVERCALL_ISHANDLED
    }
    int IOleMessageFilter.RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType) {
        // 0 = SERVERCALL_REJECTED ، 2 = SERVERCALL_RETRYLATER
        if ((dwRejectType == 0 || dwRejectType == 2) && dwTickCount < TimeoutMs) {
            return 150;                 // ۱۵۰ میلی‌ثانیه بعد دوباره تلاش کن
        }
        return -1;                      // تسلیم؛ خطا به فراخوان برگردد
    }
    int IOleMessageFilter.MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType) {
        return 2;                       // PENDINGMSG_WAITDEFPROCESS
    }
}
"@ -ErrorAction Stop
    }
    [ComRetryFilter]::Register()
    return $true
}

# =============================================================================
#  ۴) توابع کمکی
# =============================================================================
function Write-Log {
    param([string]$Msg, [string]$Level = 'INFO')
    $color = switch ($Level) { 'OK'{'Green'} 'WARN'{'Yellow'} 'ERR'{'Red'} default{'Gray'} }
    Write-Host ("  [{0}] {1}" -f $Level.PadRight(4), $Msg) -ForegroundColor $color
}

# ورد وقتی مشغول است (پنجره‌ی بازیابی، در حال راه‌اندازی، ...) فراخوانی COM را
# با خطای RPC_E_CALL_REJECTED رد می‌کند. راه درست، تلاش مجدد است.
function Invoke-Com {
    param([scriptblock]$Action, [string]$What = 'عملیات ورد',
          [int]$Retries = 40, [int]$DelayMs = 500)
    for ($i = 0; $i -lt $Retries; $i++) {
        try { return (& $Action) }
        catch {
            $m = $_.Exception.Message
            if ($m -match '0x80010001|0x8001010A|0x80010005|rejected by callee|RPC_E_|busy|مشغول') {
                if ($i -eq 4) { Write-Host "    (ورد مشغول است؛ منتظر می‌مانیم ...)" -ForegroundColor Yellow }
                Start-Sleep -Milliseconds $DelayMs
                continue
            }
            throw
        }
    }
    throw ("{0}: ورد بعد از {1} ثانیه پاسخ نداد (Call was rejected by callee). " -f $What, [int]($Retries*$DelayMs/1000) +
           "یک بار Word را دستی باز کنید، پنجره‌ی بازیابی فایل‌ها (Document Recovery) را ببندید، " +
           "سپس Word را ببندید و دوباره اجرا کنید.")
}

# بعد از عملیات سنگین (حذف چند هزار پاراگراف) ورد تا مدتی مشغول است:
# هم فراخوانی‌ها را رد می‌کند، هم مقدارهای بی‌معنا مثل «۰ پاراگراف» برمی‌گرداند.
# قبل از ادامه صبر می‌کنیم تا واقعاً آماده شود.
function Wait-WordReady {
    param($Doc, [int]$TimeoutSec = 90)
    $t = [Diagnostics.Stopwatch]::StartNew()
    $warned = $false
    while ($t.Elapsed.TotalSeconds -lt $TimeoutSec) {
        try {
            $c = $Doc.Paragraphs.Count
            if ($c -gt 0) { return [int]$c }
        } catch { }
        if (-not $warned -and $t.Elapsed.TotalSeconds -gt 3) {
            Write-Host "    (ورد پاسخ نمی‌دهد؛ منتظر می‌مانیم ...)" -ForegroundColor Yellow
            Write-Host "     پنجره‌ی Word را از نوار وظیفه باز کنید — اگر پیامی نشان می‌دهد، همان علت است." -ForegroundColor Yellow
            $warned = $true
        }
        Start-Sleep -Milliseconds 300
    }
    throw ("ورد بعد از {0} ثانیه هنوز پاسخ درستی نمی‌دهد. " -f $TimeoutSec +
           "reset-word.bat را اجرا کنید و دوباره امتحان کنید.")
}

# حذف یک بازه به‌صورت تکه‌تکه و از آخر به اول.
# حذف یکجای چند هزار پاراگراف ورد را برای مدت طولانی مشغول می‌کند.
function Remove-DocRange {
    param($Doc, [int]$From, [int]$To, [int]$Chunk = 40000)
    $end = $To
    while ($end -gt $From) {
        $start = [Math]::Max($From, $end - $Chunk)
        $null = Invoke-Com { $Doc.Range($start, $end).Delete() } -What 'حذف بخش'
        $end = $start
    }
    $null = Wait-WordReady $Doc
}

# تاریخچه‌ی Undo ورد با هزاران تغییر پر می‌شود و حافظه را تا مرز کرش بالا
# می‌برد. دوره‌ای خالی‌اش می‌کنیم (کاربر که Undo نمی‌خواهد).
function Clear-Undo {
    param($Doc)
    try { $Doc.UndoClear() } catch { }
}

$script:LeaveWordOpen = $false
$script:OpenDoc = $null
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

# استایل‌های داخلی ورد. اگر شماره‌ی داخلی کار نکرد، با نام هم امتحان می‌کنیم
# (نام‌ها در نسخه‌های غیرانگلیسی ورد فرق می‌کنند).
$script:BuiltinNames = @{
    '-1'  = @('Normal','عادی','عادي')
    '-2'  = @('Heading 1','عنوان 1','العنوان 1')
    '-3'  = @('Heading 2','عنوان 2','العنوان 2')
    '-4'  = @('Heading 3','عنوان 3','العنوان 3')
    '-20' = @('TOC 1','فهرست مطالب 1')
    '-21' = @('TOC 2','فهرست مطالب 2')
    '-22' = @('TOC 3','فهرست مطالب 3')
    '-31' = @('Footnote Text','متن پانویس','نص حاشية سفلية')
    '-34' = @('Header','سرصفحه','رأس الصفحة')
    '-35' = @('Footer','پاصفحه','تذييل الصفحة')
}
# نام محلیِ یک استایل. نسبت دادن استایل به Range.Style فقط با «نام» مطمئن
# است؛ با شماره یا با شیء، PowerShell سعی می‌کند شیء COM را به رشته تبدیل کند
# و خطای «Unable to cast COM object ... to System.String» می‌دهد.
function Get-StyleName {
    param($Style, [string]$Fallback = '')
    if ($null -eq $Style) { return $Fallback }
    foreach ($prop in @('NameLocal','Name')) {
        try { $n = [string]$Style.$prop; if ($n) { return $n } } catch { }
    }
    return $Fallback
}

# نام استایلی که واقعاً روی یک بازه نشسته است
function Get-RangeStyleName {
    param($Rng)
    try { $n = [string]$Rng.Style.NameLocal; if ($n) { return $n } } catch { }
    try { $n = [string]$Rng.Style;          if ($n) { return $n } } catch { }
    return ''
}

# اعمال استایل با چند روش، و بازخوانی برای اطمینان از اینکه واقعاً نشسته.
# روی بعضی نسخه‌های ورد، «Range.Style = نام» خطا نمی‌دهد ولی کاری هم نمی‌کند.
function Set-RangeStyle {
    param($Word, $Rng, [string]$Name, $Obj = $null, [switch]$Verify)

    $try = {
        param($how)
        try {
            switch ($how) {
                'name'       { $Rng.Style = $Name }
                'object'     { if ($null -eq $Obj) { return $false }; $Rng.Style = $Obj }
                'paragraphs' { $Rng.Paragraphs.Style = $Name }
                'selection'  { $Rng.Select(); $Word.Selection.Style = $Name }
            }
        } catch { return $false }
        if (-not $Verify) { return $true }
        return ((Get-RangeStyleName $Rng) -eq $Name)
    }

    foreach ($how in @('name','object','paragraphs','selection')) {
        if (& $try $how) { return $how }
    }
    return ''
}

function Get-BuiltinStyle {
    param($Doc, [int]$Id)
    # ۱) با شماره‌ی داخلی
    try {
        $st = $Doc.Styles.Item($Id)
        if ($null -ne $st) {
            Write-Log ("استایل داخلی {0} = «{1}» (BuiltIn={2})" -f $Id, (Get-StyleName $st '?'), $st.BuiltIn)
            return $st
        }
    } catch { }
    # ۲) با نام‌های شناخته‌شده
    foreach ($n in @($script:BuiltinNames["$Id"])) {
        if (-not $n) { continue }
        try {
            $st = $Doc.Styles.Item($n)
            if ($null -ne $st) {
                Write-Log ("استایل داخلی {0} با نام «{1}» پیدا شد" -f $Id, $n)
                return $st
            }
        } catch { }
    }
    # ۳) آخرین راه برای تیترها: بین همه‌ی استایل‌ها دنبال استایلِ داخلیِ
    #    پاراگرافی با همان سطح ساختاری می‌گردیم (نام محلی هرچه باشد)
    $wantLevel = switch ($Id) { -2 { 1 } -3 { 2 } -4 { 3 } default { 0 } }
    if ($wantLevel -gt 0) {
        try {
            foreach ($st in $Doc.Styles) {
                try {
                    if (-not $st.BuiltIn) { continue }
                    if ($st.Type -ne 1) { continue }
                    if ([int]$st.ParagraphFormat.OutlineLevel -ne $wantLevel) { continue }
                    $nm = Get-StyleName $st ''
                    if ($nm -notmatch "$wantLevel") { continue }
                    Write-Log ("استایل تیتر سطح {0} با جست‌وجو پیدا شد: «{1}»" -f $wantLevel, $nm)
                    return $st
                } catch { }
            }
        } catch { }
    }
    Write-Log ("استایل داخلی {0} پیدا نشد؛ از آن می‌گذریم." -f $Id) 'WARN'
    return $null
}

function Get-OrAddStyle {
    param($Doc, [string]$Name)
    try   { return $Doc.Styles.Item($Name) }
    catch { return $Doc.Styles.Add($Name, $wdStyleTypeParagraph) }
}

# هر ویژگی جدا ست می‌شود؛ اگر ورد یکی را نپذیرد بقیه اعمال می‌شوند
# و نامش برای گزارش نگه داشته می‌شود.
$script:StyleFails = @{}
function Set-Prop {
    param($Obj, [string]$Name, $Value)
    if ($null -eq $Obj) { return }
    try { $Obj.$Name = $Value }
    catch { $script:StyleFails[$Name] = 1 }
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
    if ($null -eq $Style) { return }
    $f = $Style.Font
    # فونت‌ها: NameBi برای متن عربی/فارسی، Name برای لاتین
    Set-Prop $f 'NameBi'    $Font
    Set-Prop $f 'Name'      $Font
    Set-Prop $f 'NameAscii' $Font
    Set-Prop $f 'NameOther' $Font
    Set-Prop $f 'SizeBi'    $Size
    Set-Prop $f 'Size'      $Size
    # مقادیر منطقی را به‌صورت bool می‌دهیم نه عدد؛ ورد به عدد ۱ ایراد می‌گیرد
    Set-Prop $f 'BoldBi'    $Bold
    Set-Prop $f 'Bold'      $Bold
    Set-Prop $f 'ItalicBi'  $false
    Set-Prop $f 'Italic'    $false
    if ($null -ne $Color) { Set-Prop $f 'Color' (RGB $Color[0] $Color[1] $Color[2]) }

    $p = $Style.ParagraphFormat
    Set-Prop $p 'ReadingOrder'    $wdReadingOrderRtl
    Set-Prop $p 'Alignment'       $Align
    Set-Prop $p 'RightIndent'     (Cm2Pt $IndRight)
    Set-Prop $p 'LeftIndent'      (Cm2Pt $IndLeft)
    Set-Prop $p 'FirstLineIndent' (Cm2Pt $FirstLine)
    Set-Prop $p 'SpaceBefore'     $SpBefore
    Set-Prop $p 'SpaceAfter'      $SpAfter
    if ($LineMul -gt 0) {
        Set-Prop $p 'LineSpacingRule' $wdLineSpaceMultiple
        Set-Prop $p 'LineSpacing'     ([math]::Round(12 * $LineMul, 2))
    }
    Set-Prop $p 'PageBreakBefore' $PageBreak
    Set-Prop $p 'KeepWithNext'    $KeepNext
    Set-Prop $p 'KeepTogether'    $KeepLines
    Set-Prop $p 'WidowControl'    $true
    Set-Prop $p 'OutlineLevel'    $Outline
    if ($null -ne $Shade) {
        try { $p.Shading.BackgroundPatternColor = (RGB $Shade[0] $Shade[1] $Shade[2]) }
        catch { $script:StyleFails['Shading'] = 1 }
    }
}

function Invoke-Replace {
    param($Doc, [string]$FindText, [string]$ReplaceText, [bool]$Wildcards = $false, [int]$Times = 1)
    for ($k = 0; $k -lt $Times; $k++) {
        # از Range(0,End) استفاده می‌کنیم نه Content — همان چیزی که جای دیگر جواب داده
        $rng = $Doc.Range(0, $Doc.Content.End)
        if ($null -eq $rng) { throw "Invoke-Replace: Range سند null برگشت." }
        $f = $rng.Find
        if ($null -eq $f)   { throw "Invoke-Replace: شیء Find سند null برگشت." }
        $f.ClearFormatting()
        $rep = $f.Replacement
        if ($null -ne $rep) { $rep.ClearFormatting() }
        # گزینه‌های Find در ورد بین فراخوانی‌ها می‌مانند؛ صریح ست می‌کنیم
        $f.Forward        = $true
        $f.Format         = $false
        $f.MatchCase      = $false
        $f.MatchWholeWord = $false
        $f.MatchWildcards = $Wildcards
        $f.Wrap           = $wdFindContinue
        $null = Invoke-Com {
            $f.Execute($FindText, $false, $false, $Wildcards, $false, $false,
                       $true, $wdFindContinue, $false, $ReplaceText, $wdReplaceAll)
        } -What 'جست‌وجو و جایگزینی'
    }
    $null = Wait-WordReady $Doc
}

# حذف پاراگراف‌های خالی بدون استفاده از Find — روش پشتیبان.
# بازه‌های پیوسته‌ی خالی را یکجا و از آخر به اول حذف می‌کند تا آفست‌ها به‌هم نریزد.
function Remove-EmptyParagraphs {
    param($Doc)
    $P = Get-Paragraphs $Doc
    $removed = 0
    $i = $P.Count - 2                      # آخرین پاراگراف سند حذف‌شدنی نیست
    while ($i -ge 0) {
        if ((Clean-Line $P.Text[$i]) -ne '') { $i--; continue }
        $j = $i
        while ($j -ge 0 -and (Clean-Line $P.Text[$j]) -eq '') { $j-- }
        $from = $P.Start[$j + 1]
        $to   = $P.End[$i]
        if ($to -gt $from) {
            $null = Invoke-Com { $Doc.Range($from, $to).Delete() } -What 'حذف پاراگراف خالی'
            $removed += ($i - $j)
        }
        $i = $j
    }
    $null = Wait-WordReady $Doc
    return $removed
}

# متن کل سند را تکه‌تکه می‌خواند.
# Range.Text روی بازه‌های خیلی بزرگ گاهی متن ناقص یا null برمی‌گرداند
# (به‌ویژه وقتی نمونه‌ی دیگری از Word فایل را باز نگه داشته باشد).
function Get-DocText {
    param($Doc)
    $total = Invoke-Com { [int]$Doc.Content.End } -What 'خواندن طول سند'
    $sb    = New-Object System.Text.StringBuilder
    $pos   = 0
    while ($pos -lt $total) {
        $to = [Math]::Min($pos + 50000, $total)
        $t  = Invoke-Com { $Doc.Range($pos, $to).Text } -What 'خواندن متن سند'
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
    $expect = Invoke-Com { [int]$Doc.Content.End } -What 'خواندن طول سند'
    if ([Math]::Abs($txt.Length - $expect) -gt 1) {
        throw ("متن ناقص خوانده شد: {0:N0} کاراکتر به‌جای {1:N0}. " -f $txt.Length, $expect +
               "همه‌ی نمونه‌های Word را ببندید و دوباره اجرا کنید.")
    }
    $parts = $txt -split "`r"
    if ($parts.Count -gt 0 -and $parts[$parts.Count-1] -eq '') {
        $parts = $parts[0..($parts.Count-2)]
    }
    # اعتبارسنجی: تعداد پاراگراف‌های شمرده‌شده باید با خودِ ورد بخواند
    $real = Wait-WordReady $Doc
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
        if (($i -ge $Lines.Count - 45) -and ($s -match $RX_COLO)) { $inColo = $true; $cls[$i] = 'COLO'; continue }

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
        for ($j = $i - 1; ($j -ge 0) -and (($i - $j) -le 8); $j--) {
            if ($cls[$j] -eq 'EMPTY') { continue }       # از خالی‌ها رد شو
            if ($cls[$j] -ne 'BODY')  { break }
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
        try { $doc = Invoke-Com { $Word.Documents.Add($SrcPath, $false, 0, $true) } -What 'باز کردن قالب' }
        catch { Write-Log ("Documents.Add نشد: {0}" -f $_.Exception.Message) 'WARN'; $doc = $null }
        if ($null -ne $doc -and (Invoke-Com { [int]$doc.Content.End } -What 'خواندن طول سند') -lt 100) {
            # قالب محتوایش را منتقل نکرد؛ خود فایل را باز می‌کنیم
            $doc.Close($wdDoNotSaveChanges); $doc = $null
        }
    }
    if ($null -eq $doc) {
        Write-Step "با Documents.Open باز می‌کنیم ..."
        $doc = Invoke-Com { $Word.Documents.Open($SrcPath, $false, $false, $false) } -What 'باز کردن فایل'
    }
    $docLen = Invoke-Com { [int]$doc.Content.End } -What 'خواندن طول سند'
    $docWin = Invoke-Com { [int]$doc.Windows.Count } -What 'خواندن پنجره‌های سند'
    Write-Step ("باز شد — {0:N0} کاراکتر، {1} پنجره" -f $docLen, $docWin)
    if ($docLen -lt 100) {
        throw ("سند تقریباً خالی برگشت ({0} کاراکتر). " -f $docLen +
               "معمولاً یعنی Word درست پاسخ نمی‌دهد — یک بار Word را دستی باز کنید، " +
               "پنجره‌ی بازیابی را ببندید، Word را ببندید و دوباره اجرا کنید.")
    }
    # حالا که سند پنجره دارد، دوباره مینیمایز کن تا جلوی چشم نباشد
    if (-not $ShowWord -and -not $HideWord) { try { $Word.WindowState = 2 } catch {} }
    if ($docWin -eq 0) {
        # بدون پنجره، SaveAs قفل می‌کند — یکی می‌سازیم
        Write-Log "سند پنجره نداشت؛ یک پنجره ساخته شد." 'WARN'
        $null = $doc.ActiveWindow
    }

    Write-Step "خاموش کردن بازبینی املا و گرامر ..."
    $doc.TrackRevisions = $false
    # به ورد بگو سند قبلاً بازبینی شده؛ وگرنه روی ۷۳۰ هزار کاراکترِ عربی
    # بازبینی پس‌زمینه راه می‌افتد و اجرا عملاً معلق می‌شود.
    try { $doc.UpdateStylesOnOpen = $false } catch {}
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
    if ($CFG.NormalizeFonts) {
        Write-Step "یک‌دست کردن قالب‌بندی کاراکترها ..."
        try { $doc.Content.Font.Reset() } catch {}
        $null = Wait-WordReady $doc
    }
    Write-Step "آماده‌ی پردازش"

    # نکته: ذخیره فقط یک بار و در انتهای کار انجام می‌شود.

    # --- زبان و جهت کلی ---------------------------------------------------
    try { $doc.Content.LanguageIDOther = $wdArabic } catch {}
    try { $doc.Content.ParagraphFormat.ReadingOrder = $wdReadingOrderRtl } catch {}

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
        Write-Step "حذف بخش خام پاورقی‌ها ..."
        Remove-DocRange $doc $P.Start[$annotIdx] (Invoke-Com { [int]$doc.Content.End })
        Write-Log "بخش خام پاورقی‌ها از متن حذف شد"
    }
    if ($idxStart -ge 0 -and -not $KeepOriginalIndex) {
        Write-Step "حذف فهرست خام ..."
        Remove-DocRange $doc $P.Start[$idxStart] $P.End[$idxEnd]
        Write-Log "فهرست خام حذف شد (به‌جایش فهرست خودکار ساخته می‌شود)"
    }

    # =====================================================================
    #  مرحله ۲ — پاک‌سازی متن
    # =====================================================================
    Write-Step "پاک‌سازی فاصله‌ها و پاراگراف‌های خالی ..."
    $before = Wait-WordReady $doc
    $findOk = $true
    if ($CFG.UseFindReplace) {
        # هر بار یک فاصله برداشته می‌شود، پس چند بار تکرار می‌کنیم.
        # نکته: wildcard استفاده نمی‌کنیم، ورد الگوی ^13 را در آن حالت رد می‌کند.
        try {
            Invoke-Replace $doc "^p " "^p" $false 8  # فاصله ابتدای پاراگراف
            Invoke-Replace $doc " ^p" "^p" $false 8  # فاصله انتهای پاراگراف
            Invoke-Replace $doc "  "  " "  $false 8  # فاصله‌های تکراری وسط خط
            Invoke-Replace $doc " ،" "،" $false 1
            Invoke-Replace $doc " ." "." $false 1
            if ($CFG.RemoveEmptyParas) { Invoke-Replace $doc "^p^p" "^p" $false 14 }
        } catch {
            $findOk = $false
            Write-Log ("جست‌وجو/جایگزینی ورد کار نکرد: {0}" -f $_.Exception.Message) 'WARN'
        }
    } else { $findOk = $false }

    # روش مستقیم (بدون Find) برای حذف پاراگراف‌های خالی
    if ($CFG.RemoveEmptyParas -and ((-not $findOk) -or ((Wait-WordReady $doc) -eq $before))) {
        Write-Step "حذف پاراگراف‌های خالی ..."
        $n = Remove-EmptyParagraphs $doc
        Write-Log ("{0:N0} پاراگراف خالی حذف شد" -f $n)
    }

    # فاصله‌های ابتدای اولین پاراگراف که علامت پاراگراف قبلش ندارد
    $head = $doc.Range(0, [Math]::Min(60, $doc.Content.End)).Text
    if ($head) {
        $lead = 0
        while ($lead -lt $head.Length -and $head[$lead] -eq ' ') { $lead++ }
        if ($lead -gt 0) { $doc.Range(0, $lead).Delete() | Out-Null }
    }
    Write-Log ("پاک‌سازی شد — {0:N0} ← {1:N0} پاراگراف" -f (Wait-WordReady $doc), $before)

    # =====================================================================
    #  مرحله ۳ — چسباندن خطِ عنوان به تیتر بالایش
    #     «الفصل الأوّل»  +  «في غسل مسّ الميّت»  →  یک تیتر دو سطری
    #     (از آخر به اول، تا شماره پاراگراف‌ها به‌هم نریزد)
    # =====================================================================
    Write-Step "چسباندن خط عنوان به تیترها ..."
    $merged = 0
    try {
    $P = Get-Paragraphs $doc
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
    } catch { Write-Log ("چسباندن عنوان‌ها ناتمام ماند: {0}" -f $_.Exception.Message) 'WARN' }
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

    Set-StyleLook -Style (Get-BuiltinStyle $doc $sNormal) -Font $fB -Size $CFG.SizeBody -Align $J -LineMul $LS

    # شیء استایل را نگه می‌داریم؛ نسبت دادن شماره‌ی استایل به Range.Style
    # روی بعضی نسخه‌های ورد کار نمی‌کند ولی نسبت دادن خودِ شیء کار می‌کند.
    $styH1 = Get-BuiltinStyle $doc $sH1
    $styH2 = Get-BuiltinStyle $doc $sH2
    $styH3 = Get-BuiltinStyle $doc $sH3

    Set-StyleLook -Style $styH1 -Font $fH -Size $CFG.SizeH1 -Bold $true `
        -Align $wdAlignCenter -SpBefore 24 -SpAfter 20 -LineMul 1.0 `
        -PageBreak $CFG.PageBreakOnH1 -KeepNext $true -Outline 1 -Color $CFG.ColorHead

    Set-StyleLook -Style $styH2 -Font $fH -Size $CFG.SizeH2 -Bold $true `
        -Align $wdAlignCenter -SpBefore 20 -SpAfter 14 -LineMul 1.0 `
        -PageBreak $CFG.PageBreakOnH2 -KeepNext $true -Outline 2 -Color $CFG.ColorHead

    Set-StyleLook -Style $styH3 -Font $fH -Size $CFG.SizeH3 -Bold $true `
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

    # پاراگراف‌های خالیِ فایل خام: ارتفاع ۱ نقطه، عملاً نامرئی
    $stEmpty = Get-OrAddStyle $doc $STY.Empty
    Set-StyleLook -Style $stEmpty -Font $fB -Size 1 -Align $wdAlignRight
    try {
        $stEmpty.ParagraphFormat.LineSpacingRule = 4     # wdLineSpaceExactly
        $stEmpty.ParagraphFormat.LineSpacing     = 1
    } catch {}

    Set-StyleLook -Style (Get-OrAddStyle $doc $STY.TocT) -Font $fH -Size $CFG.SizeH1 -Bold $true `
        -Align $wdAlignCenter -SpBefore 12 -SpAfter 20 -LineMul 1.0 -PageBreak $true -Color $CFG.ColorHead

    Set-StyleLook -Style (Get-BuiltinStyle $doc $sFootnoteText) -Font $fB -Size $CFG.SizeFootnote -Align $J -LineMul 1.0
    Set-StyleLook -Style (Get-BuiltinStyle $doc $sHeader) -Font $fH -Size $CFG.SizeHeaderFooter -Align $wdAlignCenter -LineMul 1.0
    Set-StyleLook -Style (Get-BuiltinStyle $doc $sFooter) -Font $fH -Size $CFG.SizeHeaderFooter -Align $wdAlignCenter -LineMul 1.0
    foreach ($ts in @($sTOC1, $sTOC2, $sTOC3)) {
        try { Set-StyleLook -Style (Get-BuiltinStyle $doc $ts) -Font $fB -Size ($CFG.SizeBody - 2) -Align $wdAlignRight -LineMul 1.0 } catch {}
    }
    Write-Log ("استایل تیترها →  ۱: «{0}»   ۲: «{1}»   ۳: «{2}»" -f `
               (Get-StyleName $styH1 '؟'), (Get-StyleName $styH2 '؟'), (Get-StyleName $styH3 '؟'))
    if ($script:StyleFails.Count -gt 0) {
        Write-Log ("این ویژگی‌ها را ورد نپذیرفت (بی‌اهمیت): {0}" -f `
                   (($script:StyleFails.Keys | Sort-Object) -join '، ')) 'WARN'
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
        'COLO'  = $STY.Colo;  'EMPTY'= $STY.Empty
        'H1' = (Get-StyleName $styH1 $STY.Head)
        'H2' = (Get-StyleName $styH2 $STY.Head)
        'H3' = (Get-StyleName $styH3 $STY.Head)
    }

    # اعمال استایل به‌صورت «بازه‌ای» (سریع‌تر از پاراگراف‌به‌پاراگراف)
    if ($P.Count -eq 0) { throw 'سند خالی است.' }
    Write-Step ("اعمال استایل روی {0:N0} پاراگراف ..." -f $P.Count)
    $applied = 0
    $styleErr = @{}
    $styleWay = @{}
    $styleObjOf = @{ 'H1' = $styH1; 'H2' = $styH2; 'H3' = $styH3 }
    $runStart = 0
    for ($i = 0; $i -le $P.Count; $i++) {
        $isEnd = ($i -eq $P.Count)
        if ($isEnd -or ($cls[$i] -ne $cls[$runStart])) {
            $c = $cls[$runStart]
            $rng = $doc.Range($P.Start[$runStart], $P.End[$i - 1])
            $isHead = ($c -eq 'H1' -or $c -eq 'H2' -or $c -eq 'H3')
            if ($isHead) {
                # تیترها کم‌تعدادند (حدود ۷۰ تا)، پس با بازخوانی و در صورت
                # لزوم با روش‌های جایگزین اعمالشان می‌کنیم تا حتماً بنشینند.
                $how = Set-RangeStyle -Word $Word -Rng $rng -Name $styleOf[$c] `
                                      -Obj $styleObjOf[$c] -Verify
                if ($how -eq '') {
                    if (-not $styleErr.ContainsKey($c)) {
                        $styleErr[$c] = 1
                        Write-Log ("استایل تیتر '{0}' («{1}») با هیچ روشی ننشست" -f $c, $styleOf[$c]) 'WARN'
                    }
                } elseif (-not $styleWay.ContainsKey($c)) {
                    $styleWay[$c] = $how
                }
                $lvl = [int]$c.Substring(1)
                try { $rng.ParagraphFormat.OutlineLevel = $lvl }
                catch { $script:StyleFails['OutlineLevel'] = 1 }
            } else {
                try { $rng.Style = $styleOf[$c] }
                catch {
                    if (-not $styleErr.ContainsKey($c)) {
                        $styleErr[$c] = 1
                        Write-Log ("استایل '{0}' («{1}») اعمال نشد: {2}" -f `
                                   $c, $styleOf[$c], $_.Exception.Message) 'WARN'
                    }
                }
            }
            $applied++
            $runStart = $i
        }
    }
    $stat = ($cls | Group-Object | Sort-Object Count -Descending |
             ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }) -join '  '
    Clear-Undo $doc
    if ($styleWay.Count -gt 0) {
        Write-Log ("روش اعمال تیتر: {0}" -f (($styleWay.GetEnumerator() |
                    Sort-Object Name | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }) -join '  '))
    }
    # بازخوانی سه نمونه‌ی واقعی از سند، برای اطمینان
    foreach ($lvlName in @('H1','H2','H3')) {
        for ($i = 0; $i -lt $P.Count; $i++) {
            if ($cls[$i] -ne $lvlName) { continue }
            $r  = $doc.Range($P.Start[$i], $P.End[$i])
            $sn = Get-RangeStyleName $r
            $ol = '?'
            try { $ol = [int]$r.ParagraphFormat.OutlineLevel } catch { }
            Write-Log ("نمونه {0}: «{1}»  →  استایل «{2}» ، سطح {3}" -f `
                       $lvlName, (($P.Text[$i] -split "[`v`r`n]")[0]), $sn, $ol)
            break
        }
    }
    Write-Log ("استایل‌ها اعمال شد ({0} بازه)" -f $applied)
    Write-Log ("آمار: {0}" -f $stat)

    # ذخیره‌ی میانی: از اینجا به بعد یک فایل قالب‌بندی‌شده روی دیسک هست
    if ($CFG.SaveEarly -and -not $NoSave) {
        try {
            if (Test-Path $dst) { Remove-Item $dst -Force }
            Write-Step ("ذخیره‌ی میانی در {0} ..." -f $dst)
            $doc.SaveAs2($dst, $CFG.SaveFormat)
            Write-Log ("ذخیره شد: {0}" -f $dst) 'OK'
        } catch { Write-Log ("ذخیره‌ی میانی نشد: {0}" -f $_.Exception.Message) 'WARN' }
    }

    # =====================================================================
    #  مرحله ۶ — تبدیل ارجاع‌های (۱) به پاورقی واقعی
    # =====================================================================
    if ($footnotes.Count -gt 0) {
      try {
        Write-Step ("ساخت {0:N0} پاورقی (طولانی‌ترین مرحله) ..." -f $footnotes.Count)
        $doc.Footnotes.Location      = $wdFootnoteBottom
        $doc.Footnotes.NumberingRule = $wdRestartContinuous
        $doc.Footnotes.StartingNumber = 1

        # بدون Find: محل هر ارجاع را از روی متنی که خوانده‌ایم حساب می‌کنیم.
        $txt  = Get-DocText $doc
        $seen = @{}
        $hits = New-Object System.Collections.ArrayList
        foreach ($m in [regex]::Matches($txt, '\((\d{1,5})\)')) {
            $n = [int]$m.Groups[1].Value
            if (-not $footnotes.ContainsKey($n)) { continue }
            if ($seen.ContainsKey($n)) { continue }     # فقط اولین ارجاع هر شماره
            $seen[$n] = $true
            [void]$hits.Add([pscustomobject]@{ N = $n; At = $m.Index; Len = $m.Length })
        }
        Write-Log ("{0:N0} ارجاع در متن پیدا شد" -f $hits.Count)

        # از آخر به اول، تا آفست ارجاع‌های قبلی به‌هم نریزد
        $done = 0
        for ($k = $hits.Count - 1; $k -ge 0; $k--) {
            $h = $hits[$k]
            $r = Invoke-Com { $doc.Range($h.At, $h.At + $h.Len) } -What 'یافتن ارجاع'
            $r.Text = ''                                # حذف «(۱)»
            $fn = Invoke-Com { $doc.Footnotes.Add($doc.Range($h.At, $h.At)) } -What 'افزودن پاورقی'
            $fn.Range.Text = $footnotes[$h.N]
            $done++
            # بدون این، حافظه‌ی ورد بعد از چند صد پاورقی پر می‌شود و کرش می‌کند
            if ($done % 50 -eq 0) { Clear-Undo $doc }
            if ($done % 200 -eq 0) {
                Write-Host ("      ... {0:N0} از {1:N0}" -f $done, $hits.Count) -ForegroundColor DarkGray
            }
        }
        $missing = $footnotes.Count - $done
        Write-Log ("{0:N0} پاورقی ساخته شد (بدون ارجاع: {1})" -f $done, $missing) $(if ($missing -gt 0) {'WARN'} else {'OK'})
      } catch { Write-Log ("ساخت پاورقی‌ها ناتمام ماند: {0}" -f $_.Exception.Message) 'WARN' }
    }

    # =====================================================================
    #  مرحله ۷ — صفحه‌آرایی، سربرگ/پابرگ، فهرست خودکار
    # =====================================================================
    Write-Step "صفحه‌آرایی، سربرگ و فهرست ..."
    Clear-Undo $doc
    $sec = $doc.Sections.Item(1)
    if ($null -eq $sec) { throw "بخش اول سند در دسترس نیست (احتمالاً ورد بسته شده)." }
    $ps  = $sec.PageSetup
    try { $ps.SectionDirection = $wdSectionDirectionRtl } catch {}
    Set-Prop $ps 'PageWidth'    (Cm2Pt $CFG.PageWidth)
    Set-Prop $ps 'PageHeight'   (Cm2Pt $CFG.PageHeight)
    Set-Prop $ps 'TopMargin'    (Cm2Pt $CFG.MarginTop)
    Set-Prop $ps 'BottomMargin' (Cm2Pt $CFG.MarginBottom)
    Set-Prop $ps 'RightMargin'  (Cm2Pt $CFG.MarginInside)
    Set-Prop $ps 'LeftMargin'   (Cm2Pt $CFG.MarginOutside)
    Set-Prop $ps 'MirrorMargins' $true
    Set-Prop $ps 'DifferentFirstPageHeaderFooter' $true

    # عنوان کتاب = اولین پاراگراف غیرخالی
    $bookTitle = $name
    foreach ($t in $P.Text) { $c = Clean-Line $t; if ($c -ne '') { $bookTitle = ($c -split "[`v`n]")[0]; break } }

    if ($CFG.AddHeaderFooter) {
      try {
        $hdr = $sec.Headers.Item($wdHeaderFooterPrimary)
        $hdr.Range.Text = $bookTitle
        $hdr.Range.Style = (Get-StyleName (Get-BuiltinStyle $doc $sHeader) 'Header')
        $hdr.Range.ParagraphFormat.ReadingOrder = $wdReadingOrderRtl
        $hdr.Range.ParagraphFormat.Alignment = $wdAlignCenter
        try { $hdr.Range.Borders.Item(-3).LineStyle = 1 } catch {}   # wdBorderBottom

        $ftr = $sec.Footers.Item($wdHeaderFooterPrimary)
        $ftr.Range.Text = ''
        $ftr.Range.Style = (Get-StyleName (Get-BuiltinStyle $doc $sFooter) 'Footer')
        $ftr.Range.ParagraphFormat.Alignment = $wdAlignCenter
        $null = $ftr.Range.Fields.Add($ftr.Range, $wdFieldPage)
        try { $ftr.PageNumbers.NumberStyle = $CFG.PageNumberStyle } catch {}
        Write-Log "سربرگ و شماره صفحه اضافه شد"
      } catch { Write-Log ("سربرگ/پابرگ اضافه نشد: {0}" -f $_.Exception.Message) 'WARN' }
    }

    if ($CFG.AddTOC) {
      try {
        # جای فهرست: درست قبل از اولین تیترِ واقعی (بعد از صفحه عنوان)
        # پاورقی‌ها پاراگراف جدید نمی‌سازند، پس اندیس‌های مرحله ۵ هنوز معتبرند.
        $Q = Get-Paragraphs $doc
        $anchor = 0
        if ($firstHeadIdx -ge 0 -and $firstHeadIdx -lt $Q.Count) { $anchor = $Q.Start[$firstHeadIdx] }
        $head = 'الفهرس'
        $r = $doc.Range($anchor, $anchor)
        $r.InsertBefore($head + [string][char]13)
        $doc.Range($anchor, $anchor + $head.Length + 1).Style = $STY.TocT

        $tocAt = $anchor + $head.Length + 1
        $tr = $doc.Range($tocAt, $tocAt)
        $toc = $doc.TablesOfContents.Add($tr, $true, 1, $CFG.TOCLevels,
                                         $false, '', $true, $true, '', $true, $true, $true)
        Write-Log "فهرست خودکار ساخته شد"
      } catch { Write-Log ("فهرست ساخته نشد: {0}" -f $_.Exception.Message) 'WARN' }
    }

    # =====================================================================
    #  مرحله ۸ — به‌روزرسانی و ذخیره
    # =====================================================================
    # اول ذخیره می‌کنیم و بعد سراغ کارهای سنگینِ صفحه‌بندی می‌رویم،
    # تا در هر حال یک فایل سالم روی دیسک باشد.
    if ($NoSave) {
        # سند را آماده در Word باز می‌گذاریم تا کاربر خودش ذخیره کند
        try { $Word.Visible = $true } catch {}
        try { $Word.WindowState = 1 } catch {}          # wdWindowStateMaximize
        try { $Word.Activate() } catch {}
        try { $doc.Activate() } catch {}
        Write-Host ""
        Write-Host "  ============================================================" -ForegroundColor Green
        Write-Host "   سند آماده است و در Word باز مانده." -ForegroundColor Green
        Write-Host "   در پنجره‌ی Word کلید  F12  را بزنید (Save As)، مسیر و نام" -ForegroundColor Green
        Write-Host "   دلخواه را انتخاب کنید و ذخیره کنید." -ForegroundColor Green
        Write-Host ""
        Write-Host ("   پیشنهاد نام: " + [IO.Path]::GetFileName($dst)) -ForegroundColor Green
        Write-Host "   بعد از ذخیره، برای به‌روز شدن شماره‌ی صفحاتِ فهرست:" -ForegroundColor Green
        Write-Host "   Ctrl+A  و بعد  F9  را بزنید." -ForegroundColor Green
        Write-Host "  ============================================================" -ForegroundColor Green
        Write-Host ""
        $script:LeaveWordOpen = $true
        $script:OpenDoc = $doc
        return
    }

    Write-Step ("ذخیره در {0} ..." -f $dst)
    Write-Host "     (اگر بیش از دو دقیقه اینجا ماند، پنجره‌ی Word را از نوار وظیفه باز کنید)" -ForegroundColor DarkGray
    try {
        if (Test-Path $dst) { Remove-Item $dst -Force }
        $doc.SaveAs2($dst, $CFG.SaveFormat)
    } catch {
        try { $doc.SaveAs($dst, $CFG.SaveFormat) }
        catch { throw ("ذخیره نشد: {0}" -f $_.Exception.Message) }
    }
    if (Test-Path $dst) {
        Write-Log ("ذخیره شد: {0}  ({1:N0} کیلوبایت)" -f $dst, ((Get-Item $dst).Length/1KB)) 'OK'
    } else {
        Write-Log "ورد خطا نداد ولی فایلی ساخته نشد!" 'ERR'
    }

    if ($CFG.AlsoDocx -and $CFG.SaveFormat -eq 0) {
        try {
            $dx = [IO.Path]::ChangeExtension($dst, '.docx')
            Write-Step ("ساخت نسخه‌ی docx ..." )
            $doc.SaveAs2($dx, 16)
            Write-Log ("ساخته شد: {0}" -f $dx) 'OK'
        } catch { Write-Log ("نسخه‌ی docx ساخته نشد: {0}" -f $_.Exception.Message) 'WARN' }
    }

    # شماره‌ی صفحه‌های فهرست به صفحه‌بندی نیاز دارد و کند است؛ جدا و اختیاری
    if ($CFG.AddTOC) {
        try {
            Write-Step "به‌روزرسانی شماره‌ی صفحات فهرست ..."
            try { $doc.Application.Options.Pagination = $true } catch {}
            if ($doc.TablesOfContents.Count -gt 0) { $doc.TablesOfContents.Item(1).Update() }
            $doc.Fields.Update() | Out-Null
            $doc.Save()
            $pages = '?'
            try { $pages = $doc.ComputeStatistics(2) } catch {}
            Write-Log ("فهرست به‌روز شد — {0} صفحه" -f $pages) 'OK'
        } catch { Write-Log ("به‌روزرسانی فهرست نشد: {0}" -f $_.Exception.Message) 'WARN' }
    }

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

# همه‌ی پیام‌ها در یک فایل متنی هم ذخیره می‌شوند تا بشود فرستادشان
$script:LogPath = Join-Path $OutputPath ("log-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".txt")
try { Start-Transcript -Path $script:LogPath -Force | Out-Null } catch { $script:LogPath = '' }

Write-Host ""
Write-Host "  نسخه اسکریپت: $SCRIPT_VERSION" -ForegroundColor DarkGray
Write-Host "  تعداد فایل: $($files.Count)" -ForegroundColor White
Write-Host "  خروجی    : $OutputPath" -ForegroundColor White
if ($script:LogPath) { Write-Host "  فایل لاگ  : $script:LogPath" -ForegroundColor Cyan }

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

try {
    if (Register-ComRetryFilter) { Write-Log "فیلتر تکرار خودکار COM ثبت شد" 'OK' }
} catch { Write-Log ("ثبت فیلتر COM نشد: {0}" -f $_.Exception.Message) 'WARN' }

$word = $null
try {
    $word = New-Object -ComObject Word.Application
} catch {
    Write-Host "`nMicrosoft Word نصب نیست یا قابل اجرا نیست.`n" -ForegroundColor Red
    return
}

# اول صبر کن تا ورد واقعاً آماده‌ی پاسخ‌گویی به COM شود.
# اگر پنجره‌ی بازیابی فایل‌ها باز باشد، ورد همه‌ی فراخوانی‌ها را رد می‌کند.
$null = Invoke-Com { $word.Documents.Count } -What 'آماده شدن ورد'

# ورد را باز ولی مینیمایز اجرا می‌کنیم.
# در حالت کاملاً نامرئی، اگر ورد بخواهد پنجره‌ای نشان دهد (مثلاً هنگام ذخیره)
# آن پنجره دیده نمی‌شود و اجرا برای همیشه قفل می‌ماند.
Invoke-Com { $word.Visible = -not $HideWord } -What 'نمایش ورد'
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
# ما استایل‌های داخلی را عوض می‌کنیم؛ ورد نباید بخواهد Normal.dotm را ذخیره کند
try { $word.Options.SaveNormalPrompt         = $false } catch {}
# ScreenUpdating را عمداً خاموش نمی‌کنیم: ترکیب آن با پنجره‌ی نامرئی
# باعث قفل شدن SaveAs می‌شود و وقتی پنجره مینیمایز است سودی هم ندارد.
$swAll = [Diagnostics.Stopwatch]::StartNew()
$ok = 0; $fail = 0

$fileNo = 0
foreach ($f in $files) {
    $fileNo++
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        Convert-Book -Word $word -SrcPath $f.FullName -OutDir $OutputPath
        $ok++
        Write-Log ("زمان: {0:N1} ثانیه" -f $sw.Elapsed.TotalSeconds)

        # حالت دستی: منتظر بمان تا کاربر ذخیره کند، بعد سراغ کتاب بعدی برو
        if ($script:LeaveWordOpen -and $fileNo -lt $files.Count) {
            Write-Host ""
            Write-Host ("  کتاب {0} از {1} آماده است. بعد از ذخیره در Word، اینجا Enter بزنید" -f `
                        $fileNo, $files.Count) -ForegroundColor Yellow
            Write-Host ("  تا کتاب بعدی ({0}) شروع شود." -f $files[$fileNo].Name) -ForegroundColor Yellow
            [void](Read-Host "  Enter")
            try { $script:OpenDoc.Close($wdDoNotSaveChanges) } catch {}
            $script:OpenDoc = $null
            $script:LeaveWordOpen = $false
        }
    } catch {
        $fail++
        Write-Log ("خطا در '{0}': {1}" -f $f.Name, $_.Exception.Message) 'ERR'
        while ($word.Documents.Count -gt 0) {
            try { $word.Documents.Item(1).Close($wdDoNotSaveChanges) } catch { break }
        }
    }
}

if ($script:LeaveWordOpen) {
    Write-Host "  Word باز مانده تا سند را ذخیره کنید." -ForegroundColor Green
} else {
    try { $word.Quit() } catch { Write-Host "  (ورد از قبل بسته شده بود)" -ForegroundColor DarkGray }
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch {}
}
try { if ('ComRetryFilter' -as [type]) { [ComRetryFilter]::Revoke() } } catch {}
[GC]::Collect(); [GC]::WaitForPendingFinalizers()

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host ("  تمام شد — موفق: {0}   ناموفق: {1}   زمان کل: {2:N1} دقیقه" -f `
            $ok, $fail, $swAll.Elapsed.TotalMinutes) -ForegroundColor Green
Write-Host ("  خروجی‌ها: {0}" -f $OutputPath) -ForegroundColor Green
if ($script:LogPath) {
    Write-Host ""
    Write-Host "  گزارش کامل این اجرا در این فایل ذخیره شد:" -ForegroundColor Cyan
    Write-Host ("  {0}" -f $script:LogPath) -ForegroundColor Cyan
    Write-Host "  اگر مشکلی بود، همین فایل را بفرستید." -ForegroundColor Cyan
}
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host ""
try { Stop-Transcript | Out-Null } catch {}
