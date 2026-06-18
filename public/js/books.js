// ====================================================
// متغیرهای کتابخانه و کتاب‌خوان
// ====================================================
let allBooks=[], currentBookId=null, bookData=[], currentIndex=0;
let fontSize=16, currentTheme='light', currentFont='vazir', lineHeight=2.2;
let uiVisible=true, bookmarks=[], notes={};
let _searchHighlightQuery = null;
let touchStartX=0, touchEndX=0;

// ====================================================
// رندر کتابخانه
// ====================================================
function renderLibrary() {
    const grid=document.getElementById('books-grid'), empty=document.getElementById('lib-empty'), count=document.getElementById('lib-count');
    const homeContainer=document.getElementById('home-books-container');
    if(!grid || !homeContainer || !empty) return;

    const isOffline = !navigator.onLine;

    // نمایش/مخفی کردن بنر آفلاین
    let offlineBanner = document.getElementById('offline-library-banner');
    if (isOffline) {
        if (!offlineBanner) {
            offlineBanner = document.createElement('div');
            offlineBanner.id = 'offline-library-banner';
            offlineBanner.className = 'mx-4 mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-amber-700 text-xs';
            offlineBanner.innerHTML = '<i class="fas fa-wifi-slash text-amber-500"></i><span>حالت آفلاین — فقط کتاب‌های دانلودشده قابل مطالعه‌اند</span>';
            grid.parentElement.insertBefore(offlineBanner, grid);
        }
        offlineBanner.style.display = '';
    } else if (offlineBanner) {
        offlineBanner.style.display = 'none';
    }

    count.textContent = allBooks.length ? toFa(allBooks.length)+' عنوان کتاب' : '';
    if (!allBooks.length) {
        grid.innerHTML='';
        homeContainer.innerHTML='';
        empty.classList.remove('hidden');
        empty.classList.add('flex');
        return;
    }
    empty.classList.add('hidden');
    empty.classList.remove('flex');

    const colors=['from-indigo-600 to-indigo-400','from-sky-600 to-sky-400','from-rose-600 to-pink-400','from-amber-500 to-orange-400','from-teal-600 to-teal-400','from-violet-600 to-violet-400'];

    const renderCard = (book, i, isHome=false) => {
        if (i < 0) i = 0;
        const saved=parseInt(localStorage.getItem('book_'+book.id+'_page')||'0');
        const progress=saved&&book.page_count?Math.round((saved/book.page_count)*100):0;
        const widthClass = isHome ? 'w-28 shrink-0 snap-center' : 'w-full';
        const offline = isBookOffline(book.id);
        const unavailable = isOffline && !offline;

        return `<div onclick="${book.book_type==='pdf'?`openPdfBook(${book.id})`:`openBook(${book.id})`}" class="${widthClass} relative cursor-pointer book-card active:scale-95 transition-transform${unavailable ? ' opacity-40' : ''}">
            <div class="rounded-2xl overflow-hidden aspect-[2/3] relative book-cover-wrap shadow-md">
                ${book.cover?`<img src="${book.cover}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:''}
                <div class="absolute inset-0 bg-gradient-to-br ${colors[i%colors.length]} flex items-end justify-center pb-3 px-2" style="${book.cover?'display:none':''}"><span class="text-white text-center font-black text-[9px] leading-tight drop-shadow">${book.title}</span></div>
                ${progress>0?`<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-4 pb-1.5 px-2"><div class="w-full bg-white/30 rounded-full h-1 overflow-hidden"><div class="bg-white h-full rounded-full" style="width:${progress}%"></div></div><span class="text-[8px] text-white/80 block text-center mt-0.5">${toFa(progress)}٪</span></div>`:''}
                ${!isOffline ? `<button onclick="event.stopPropagation();toggleOfflineBook(${book.id})" id="dl-btn-${book.id}"
                    class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md z-20 ${offline ? 'bg-brand-500 text-white' : 'bg-white/90 text-gray-500'}"
                    title="${offline ? 'حذف آفلاین' : 'دانلود'}">
                    <i class="fas ${offline ? 'fa-check' : 'fa-download'} text-[9px]"></i>
                </button>` : offline ? `<span class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md z-20 bg-brand-500 text-white" title="آفلاین"><i class="fas fa-check text-[9px]"></i></span>` : ''}
            </div>
            <h3 class="book-title font-bold text-[10px] text-gray-800 line-clamp-2 mt-1 leading-tight transition-all duration-200">${book.title}</h3>
            <p class="text-[9px] text-gray-400 truncate">${book.author||''}</p>
        </div>`;
    };

    // مرتب‌سازی بر اساس ترتیب ادمین
    const sortedBooks = [...allBooks].sort((a, b2) => (a.sort_order ?? 9999) - (b2.sort_order ?? 9999));
    grid.innerHTML = sortedBooks.map((b, i) => renderCard(b, i, false)).join('');

    // در خانه: کتاب‌ها بر اساس ترتیب ادمین (sort_order)
    const titleEl = document.getElementById('home-books-title');
    if (titleEl) titleEl.textContent = 'کتاب‌ها';
    const homeBooks = [...allBooks].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    homeContainer.innerHTML = homeBooks.slice(0, 8).map((b, i) => renderCard(b, i, true)).join('') +
        `<div class="shrink-0 w-4"></div>`;
}

// ====================================================
// PDF — باز کردن مستقیم در تب جدید
// ====================================================
function openPdfBook(bookId) {
    localStorage.setItem('book_'+bookId+'_last_read', Date.now().toString());
    const a = document.createElement('a');
    a.href = '/api/books/' + bookId + '/pdf';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
}

async function openBook(bookId, targetPageNum, searchQuery) {
    let _searchHit = false;
    localStorage.setItem('book_'+bookId+'_last_read', Date.now().toString());
    // اطمینان از حضور صفحه کتابخانه در navigation stack
    if (typeof _screenStack !== 'undefined' && _screenStack[_screenStack.length - 1] !== 'library') {
        _screenStack.push('library');
    }
    const ls=document.getElementById('loading-screen');
    ls.style.display='flex';
    ls.classList.remove('hidden');
    ls.style.opacity='1';
    try {
        let rows;
        const isOnline = navigator.onLine;
        const offlineData = await getOfflineBook(bookId).catch(() => null);

        if (!isOnline && offlineData) {
            // حالت آفلاین: بارگذاری از IndexedDB
            rows = offlineData.pages;
            showToast('بارگذاری از حافظه آفلاین');
        } else if (!isOnline && !offlineData) {
            throw new Error('این کتاب دانلود نشده. برای مطالعه آفلاین ابتدا آن را دانلود کنید');
        } else {
            // حالت آنلاین: دریافت از سرور
            const r = await fetch('/api/books/'+bookId+'/pages');
            try { rows = await r.json(); } catch(err) { throw new Error('پاسخ سرور نامعتبر است'); }
            if (!r.ok) throw new Error(rows.error || 'مشکل در ارتباط با سرور');
        }

        if (!Array.isArray(rows)) throw new Error('ساختار اطلاعات کتاب نامعتبر است');
        if (rows.length === 0) throw new Error('این کتاب هیچ محتوایی ندارد');

        currentBookId=bookId;
        bookData=rows.map((item,index)=>({
            index: index,
            rowId: item.ID,
            name: item.name || 'بدون عنوان',
            text: item.text || '',
            season: item.season || 'بدون فصل'
        }));

        loadBookUserData();
        buildTOC();

        const slider=document.getElementById('page-slider');
        if(slider) slider.max=bookData.length-1;

        if (targetPageNum != null || searchQuery) {
            let idx = -1;
            // ۰) تطبیق دقیق با شناسه‌ی ردیف (قطعی‌ترین — از نتیجه‌ی سرور)
            if (targetPageNum != null) {
                idx = bookData.findIndex(p => p.rowId != null && String(p.rowId) === String(targetPageNum));
            }
            // ۱) تطبیق متنی با نرمال‌سازی فارسی/عربی + حذف HTML
            if (idx < 0 && searchQuery) {
                const nf = (typeof _normFa === 'function')
                    ? _normFa
                    : (s => (s||'').toString().toLowerCase());
                const clean = s => nf((s == null ? '' : s.toString()).replace(/<[^>]*>/g, ' '));
                const sq = nf(searchQuery);
                const norm = bookData.map(p => clean(p.name) + ' ' + clean(p.text));
                idx = norm.findIndex(t => t.includes(sq));
                if (idx < 0) {
                    const words = sq.split(' ').filter(w => w.length > 1);
                    if (words.length) idx = norm.findIndex(t => words.every(w => t.includes(w)));
                }
                if (idx < 0) {
                    const words = sq.split(' ').filter(w => w.length > 1).sort((a, b) => b.length - a.length);
                    if (words.length) idx = norm.findIndex(t => t.includes(words[0]));
                }
            }
            _searchHit = idx >= 0;
            currentIndex = idx >= 0 ? idx : 0;
        } else {
            currentIndex=parseInt(localStorage.getItem('book_'+bookId+'_page')||'0');
            if(currentIndex>=bookData.length || isNaN(currentIndex)) currentIndex=0;
        }

        const book=allBooks.find(b=>b.id == bookId);
        document.getElementById('toc-book-title').textContent=book?book.title:'کتاب';
        document.getElementById('book-main-title').textContent=book?book.title:'کتاب';

        hideLoading();
        if ((targetPageNum != null || searchQuery) && _searchHit) {
            // صفحه پیدا شد → مستقیم به همان صفحه‌ی متن + هایلایت کلمه جستجو
            if (searchQuery) _searchHighlightQuery = searchQuery;
            goToPage(currentIndex);
        } else {
            // پیدا نشد (یا فقط عنوان مطابقت داشت) → فهرست
            openToc();
        }
    } catch(e) {
        console.error("Open Book Error:", e);
        hideLoading();
        showToast('خطا: ' + e.message);
    }
}

async function toggleOfflineBook(bookId) {
    if (isBookOffline(bookId)) {
        if (!confirm('این کتاب از حافظه آفلاین حذف شود؟')) return;
        await removeOfflineBook(bookId);
        updateDlBtn(bookId, false);
        showToast('کتاب از حافظه حذف شد');
    } else {
        const btn = document.getElementById('dl-btn-' + bookId);
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin text-[9px]"></i>'; btn.disabled = true; }
        try {
            const pageCount = await downloadBookForOffline(bookId, (pct, msg) => {
                if (btn) btn.title = msg;
            });
            updateDlBtn(bookId, true);
            showToast(`کتاب ذخیره شد (${toFa(pageCount)} صفحه)`);
        } catch(e) {
            if (btn) { btn.disabled = false; updateDlBtn(bookId, false); }
            showToast('خطا در دانلود: ' + e.message);
        }
    }
}

function updateDlBtn(bookId, downloaded) {
    const btn = document.getElementById('dl-btn-' + bookId);
    if (!btn) return;
    btn.disabled = false;
    btn.className = `absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg z-20 ${downloaded ? 'bg-brand-500 text-white' : 'bg-white/90 text-gray-600'}`;
    btn.title = downloaded ? 'حذف از حافظه آفلاین' : 'دانلود برای آفلاین';
    btn.innerHTML = `<i class="fas ${downloaded ? 'fa-check' : 'fa-download'} text-[10px]"></i>`;
}

// ====================================================
// TOC و کتاب‌خوان
// ====================================================
function openToc() {
    updateTocProgressUI();
    buildBookmarksTab();
    buildNotesTab();
    document.getElementById('toc-overlay').classList.add('open');
    // هر بار که فهرست باز میشه یک history entry منحصربه‌فرد می‌زنیم
    if (currentBookId != null) {
        try { history.pushState({ app: true, view: 'toc', t: Date.now() }, '', '#book-' + currentBookId); } catch(e) {}
    }
}
function closeToc() { document.getElementById('toc-overlay').classList.remove('open'); }
function openReader() {
    document.getElementById('reader-overlay').classList.add('open');
    // history entry برای reader — جداگانه از فهرست
    if (currentBookId != null) {
        try { history.pushState({ app: true, view: 'reader', t: Date.now() }, '', '#book-' + currentBookId + '-read'); } catch(e) {}
    }
}
function closeReader() {
    _flushSavePage();
    document.getElementById('reader-overlay').classList.remove('open');
    // openToc اینجا صدا زده نمیشه — popstate مستقیم toc رو باز میکنه
    // (هنگام بک گوشی) یا دکمه هدر history.back() صدا میزنه
}
function _flushSavePage() {
    if (_savePageTimer) {
        clearTimeout(_savePageTimer);
        _savePageTimer = null;
        try { if (currentBookId != null) localStorage.setItem('book_'+currentBookId+'_page', currentIndex); } catch(e) {}
    }
}
window.addEventListener('beforeunload', () => { try { _flushSavePage(); } catch(e) {} });

function buildTOC() {
    const container=document.getElementById('main-toc-container'); if(!container||!bookData.length) return;
    let seasons={};
    bookData.forEach((p,i)=>{ const s=p.season||'بدون فصل'; if(!seasons[s]) seasons[s]=[]; seasons[s].push({...p,originalIndex:i}); });
    let html='';
    let seasonIndex=0;
    Object.keys(seasons).forEach(season=>{
        const pages=seasons[season];
        const sid='toc-season-'+seasonIndex;
        // اولین بخش باز است، بقیه بسته
        const isOpen = seasonIndex === 0;
        html+=`<div class="mb-2">
            <button onclick="toggleTocSeason('${sid}')" class="w-full flex items-center gap-2 mb-1 px-2 py-2 rounded-xl hover:bg-gray-100 transition text-right">
                <i class="fas fa-chevron-${isOpen?'up':'down'} text-brand-500 text-xs toc-chevron" id="${sid}-chevron"></i>
                <i class="fas fa-folder text-brand-500 text-xs"></i>
                <span class="text-xs font-bold text-gray-600 flex-1">${season}</span>
                <span class="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">${toFa(pages.length)}</span>
            </button>
            <div id="${sid}" class="${isOpen?'':'hidden'}">`;
        pages.forEach(p=>{ html+=`<button onclick="goToPage(${p.originalIndex})" class="w-full text-right px-4 py-3 bg-white hover:bg-brand-50 rounded-xl text-sm text-gray-700 transition mb-1 border border-gray-100 truncate shadow-sm"><span class="text-gray-300 text-xs ml-2">${toFa(p.originalIndex+1)}.</span> ${p.name}</button>`; });
        html+=`</div></div>`;
        seasonIndex++;
    });
    container.innerHTML=html;
}

function toggleTocSeason(sid) {
    const el = document.getElementById(sid);
    const chevron = document.getElementById(sid+'-chevron');
    if (!el) return;
    const isHidden = el.classList.contains('hidden');
    el.classList.toggle('hidden', !isHidden);
    if (chevron) {
        chevron.classList.toggle('fa-chevron-down', !isHidden);
        chevron.classList.toggle('fa-chevron-up', isHidden);
    }
}

function updateTocProgressUI() {
    if(!bookData.length) return;
    const pct=Math.round(((currentIndex+1)/bookData.length)*100);
    const bar=document.getElementById('toc-progress-bar'), text=document.getElementById('toc-progress-text'), info=document.getElementById('toc-page-info');
    if(bar) bar.style.width=pct+'%'; if(text) text.textContent=toFa(pct)+'٪'; if(info) info.textContent='صفحه '+toFa(currentIndex+1)+' از '+toFa(bookData.length);
}

function resumeReading() { if(bookData.length) goToPage(currentIndex); }

function switchTab(tab) {
    const tabs = ['toc', 'bookmarks', 'notes'];
    tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('tab-content-' + t);
        if(!btn || !content) return;
        if (t === tab) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
            btn.classList.remove('text-gray-500');
            content.classList.remove('hidden');
            if (t === 'bookmarks') buildBookmarksTab();
            if (t === 'notes') buildNotesTab();
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
            btn.classList.add('text-gray-500');
            content.classList.add('hidden');
        }
    });
}

function goToPage(index) {
    if(index<0||index>=bookData.length) return;
    currentIndex=index; const page=bookData[currentIndex];
    let htmlText=page.text;
    if(!htmlText.includes('<p>')&&!htmlText.includes('<br>')) htmlText=htmlText.replace(/\n/g,'<br><br>');
    htmlText=htmlText.replace(/\[(\d+)\]/g,'<sup class="text-brand-600 font-bold mx-0.5">[$1]</sup>');
    let finalHTML=`<h2 class="text-3xl font-black mb-8 pb-4 border-b-2 border-brand-100 leading-snug">${page.name}</h2>`+htmlText;
    if(notes[currentIndex]) finalHTML+=`<div class="mt-12 pt-6 border-t border-dashed border-gray-300 bg-gray-50 p-4 rounded-2xl"><h3 class="text-sm font-bold text-gray-500 mb-2"><i class="fas fa-pen-alt ml-1"></i> یادداشت:</h3><p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">${notes[currentIndex]}</p></div>`;
    const tc=document.getElementById('text-content');
    if(tc){tc.innerHTML=finalHTML;tc.style.fontSize=fontSize+'px';convertDOMNumbers(tc);applySearchHighlight();applyHighlightsToPage();}
    document.getElementById('header-title').textContent=page.name;
    document.getElementById('chapter-title').textContent=page.season||'';
    document.getElementById('page-counter').textContent=toFa(currentIndex+1)+' / '+toFa(bookData.length);
    const slider=document.getElementById('page-slider'); if(slider) slider.value=currentIndex;
    const cc=document.getElementById('content-container'); if(cc) cc.scrollTop=0;
    const bmi=document.getElementById('menu-bookmark-icon');
    if(bmi) bmi.className=bookmarks.includes(currentIndex)?'fas fa-bookmark ml-3 w-4 text-center text-brand-600':'far fa-bookmark ml-3 w-4 text-center';
    if(currentBookId) _scheduleSavePage(currentBookId, currentIndex);
    closeToc(); openReader();
}
let _savePageTimer = null;
function _scheduleSavePage(bookId, idx) {
    if (_savePageTimer) clearTimeout(_savePageTimer);
    _savePageTimer = setTimeout(() => {
        try { localStorage.setItem('book_'+bookId+'_page', idx); } catch(e) {}
        _savePageTimer = null;
    }, 400);
}

function nextPage(){goToPage(currentIndex-1);}
function prevPage(){goToPage(currentIndex+1);}

function toggleReaderUI(){
    const h=document.getElementById('reader-header'),f=document.getElementById('reader-footer');
    uiVisible=!uiVisible; h.classList.toggle('slide-up-hide',!uiVisible); f.classList.toggle('slide-down-hide',!uiVisible);
}

function setupSwipe(){
    const el=document.getElementById('content-container'); if(!el) return;
    let touchStartY=0;
    el.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].screenX;touchStartY=e.changedTouches[0].screenY;},{passive:true});
    el.addEventListener('touchend',e=>{
        touchEndX=e.changedTouches[0].screenX;
        const dx=touchStartX-touchEndX;
        const dy=Math.abs(e.changedTouches[0].screenY-touchStartY);
        if(Math.abs(dx)>70&&Math.abs(dx)>dy*1.5){
            const s=window.getSelection();if(s&&!s.isCollapsed)return;
            if(dx>0)nextPage();else prevPage();
        }
    },{passive:true});
    el.addEventListener('click',()=>{if(window.getSelection().toString().length>0)return;toggleReaderUI();document.getElementById('page-action-menu').classList.add('hidden');});
}

// ====================================================
// نشان‌ها و یادداشت‌ها
// ====================================================
function loadBookUserData(){if(!currentBookId)return;bookmarks=JSON.parse(localStorage.getItem('book_'+currentBookId+'_bookmarks')||'[]');notes=JSON.parse(localStorage.getItem('book_'+currentBookId+'_notes')||'{}');}
function saveBookUserData(){if(!currentBookId)return;localStorage.setItem('book_'+currentBookId+'_bookmarks',JSON.stringify(bookmarks));localStorage.setItem('book_'+currentBookId+'_notes',JSON.stringify(notes));}
function toggleBookmark(){const idx=bookmarks.indexOf(currentIndex);if(idx>-1){bookmarks.splice(idx,1);showToast('نشان حذف شد');}else{bookmarks.push(currentIndex);showToast('نشان‌گذاری شد');}saveBookUserData();const bmi=document.getElementById('menu-bookmark-icon');if(bmi)bmi.className=bookmarks.includes(currentIndex)?'fas fa-bookmark ml-3 w-4 text-center text-brand-600':'far fa-bookmark ml-3 w-4 text-center';document.getElementById('page-action-menu').classList.add('hidden');}

function buildBookmarksTab(){
    const c=document.getElementById('bookmarks-container');if(!c)return;
    if(!bookmarks.length){
        c.innerHTML='<div class="text-center py-12"><i class="far fa-bookmark text-4xl text-gray-200 mb-3"></i><p class="text-gray-400 text-sm">هنوز نشانی اضافه نشده</p></div>';
        return;
    }
    c.innerHTML=bookmarks.sort((a,b)=>a-b).map(idx=>{
        const p=bookData[idx];if(!p)return'';
        return`<button onclick="goToPage(${idx})" class="w-full text-right px-4 py-3 bg-white hover:bg-brand-50 rounded-xl text-sm text-gray-700 transition mb-1 border border-gray-100 flex items-center shadow-sm"><i class="fas fa-bookmark text-brand-500 ml-3 text-xs"></i><span class="truncate">${p.name}</span><span class="text-xs text-gray-300 mr-auto">صفحه ${toFa(idx+1)}</span></button>`;
    }).join('');
}

function buildNotesTab() {
    const c = document.getElementById('notes-container'); if(!c) return;
    const noteKeys = Object.keys(notes).map(Number).sort((a,b) => a-b);
    if(!noteKeys.length){
        c.innerHTML='<div class="text-center py-12"><i class="far fa-sticky-note text-4xl text-gray-200 mb-3"></i><p class="text-gray-400 text-sm">هنوز یادداشتی اضافه نشده</p></div>';
        return;
    }
    c.innerHTML = noteKeys.map(idx => {
        const p = bookData[idx]; if(!p) return '';
        const noteText = notes[idx].length > 40 ? notes[idx].substring(0, 40) + '...' : notes[idx];
        return `<button onclick="goToPage(${idx})" class="w-full text-right px-4 py-3 bg-white hover:bg-brand-50 rounded-xl text-sm text-gray-700 transition mb-1 border border-gray-100 flex flex-col shadow-sm">
                    <div class="flex items-center w-full mb-2">
                        <i class="fas fa-pen-alt text-brand-500 ml-2 text-xs"></i>
                        <span class="font-bold truncate">${p.name}</span>
                        <span class="text-[10px] text-gray-300 mr-auto">صفحه ${toFa(idx+1)}</span>
                    </div>
                    <p class="text-xs text-gray-500 leading-relaxed text-right line-clamp-2">${noteText}</p>
                </button>`;
    }).join('');
}

function openNoteModal(){document.getElementById('page-action-menu').classList.add('hidden');document.getElementById('note-textarea').value=notes[currentIndex]||'';document.getElementById('note-modal').classList.remove('hidden');document.getElementById('note-modal').classList.add('flex');}
function closeNoteModal(){document.getElementById('note-modal').classList.add('hidden');document.getElementById('note-modal').classList.remove('flex');}
function saveNote(){const v=document.getElementById('note-textarea').value.trim();if(v)notes[currentIndex]=v;else delete notes[currentIndex];saveBookUserData();closeNoteModal();goToPage(currentIndex);showToast('یادداشت ذخیره شد');}

function saveSelectionToNote() {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : (_savedRange ? _savedRange.toString().trim() : '');
    if (!text) { hideHighlightToolbar(); showToast('متنی انتخاب نشده'); return; }
    hideHighlightToolbar();
    sel && sel.removeAllRanges();
    const existing = notes[currentIndex] || '';
    const separator = existing ? '\n---\n' : '';
    notes[currentIndex] = existing + separator + text;
    saveBookUserData();
    showToast('متن انتخابی در یادداشت ذخیره شد');
}

// ====================================================
// جستجوی داخل کتاب
// ====================================================
function openSearch(){document.getElementById('search-modal').classList.remove('hidden');document.getElementById('search-modal').classList.add('flex');document.getElementById('search-input').focus();}
function closeSearch(){document.getElementById('search-modal').classList.add('hidden');document.getElementById('search-modal').classList.remove('flex');}
function performSearch(){const q=document.getElementById('search-input').value.trim().toLowerCase();if(!q)return;const results=bookData.filter(p=>p.name.toLowerCase().includes(q)||p.text.toLowerCase().includes(q));const c=document.getElementById('search-results');if(!results.length){c.innerHTML='<div class="text-center py-12 text-gray-400"><p>نتیجه‌ای یافت نشد</p></div>';return;}c.innerHTML=results.map(p=>{const s=p.text.replace(/<[^>]*>/g,'').substring(0,100);return`<button onclick="goToPage(${p.index});closeSearch()" class="w-full text-right p-4 bg-white rounded-xl border border-gray-100 hover:bg-brand-50 transition shadow-sm"><h4 class="font-bold text-sm text-gray-800 mb-1">${p.name}</h4><p class="text-xs text-gray-400 line-clamp-2">${s}...</p></button>`;}).join('');}

// ====================================================
// تنظیمات خواندن
// ====================================================
function loadSettings() {
    fontSize = parseInt(localStorage.getItem('reader_fontSize') || '16');
    lineHeight = parseFloat(localStorage.getItem('reader_lineHeight') || '2.2');
    currentTheme = localStorage.getItem('reader_theme') || 'light';
    currentFont = localStorage.getItem('reader_font') || 'vazir';
    const sc = localStorage.getItem('reader_titleColor');
    if (sc) document.documentElement.style.setProperty('--title-color', sc);
    const tc = localStorage.getItem('reader_textColor');
    if (tc) document.documentElement.style.setProperty('--text-color', tc);
    setTimeout(() => {
        updateTitleColorUI(sc || 'inherit');
        updateTextColorUI(tc || 'inherit');
    }, 0);
    document.documentElement.style.setProperty('--line-height', lineHeight);
    applyTheme();
    applyFont();

    const tcEl = document.getElementById('text-content');
    if (tcEl) tcEl.style.fontSize = fontSize + 'px';
    ['single-post-content', 'news-single-content', 'statements-single-content'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.fontSize = fontSize + 'px';
    });
    document.getElementById('font-size-display').textContent = fontSize + 'px';
    document.getElementById('line-height-display').textContent = lineHeight.toFixed(1);
    applySiteSettings();
}

function applySettingsObject(s) {
    // اعمال تنظیمات اسپلش روی صفحه بارگذاری (اگر هنوز نمایش داده می‌شود)
    const ls = document.getElementById('loading-screen');
    if (ls) {
        if (s.splash_icon_url) {
            ls.style.backgroundImage = 'url("' + s.splash_icon_url + '")';
            ls.style.backgroundSize = 'cover';
            ls.style.backgroundPosition = 'center center';
            ls.style.backgroundRepeat = 'no-repeat';
            const spin = document.getElementById('loading-spinner');
            const st = document.getElementById('splash-title-el');
            const sub = document.getElementById('loading-text');
            if (spin) spin.style.display = 'none';
            if (st) st.style.display = 'none';
            if (sub) sub.style.display = 'none';
        } else {
            if (s.splash_bg_color) ls.style.background = s.splash_bg_color;
            if (s.splash_title) { const el = document.getElementById('splash-title-el'); if (el) { el.style.display = ''; el.textContent = s.splash_title; } }
            if (s.splash_subtitle) { const el = document.getElementById('loading-text'); if (el) { el.style.display = ''; el.textContent = s.splash_subtitle; } }
            if (s.splash_spinner_color) {
                const spin = document.getElementById('loading-spinner');
                if (spin) { spin.style.borderColor = s.splash_spinner_color + '33'; spin.style.borderTopColor = s.splash_spinner_color; }
            }
        }
    }
    const nameEl = document.querySelector('#screen-home header h1');
    const subEl = document.querySelector('#screen-home header h2');
    if (nameEl && s.site_name) nameEl.textContent = s.site_name;
    if (subEl && s.site_subtitle) subEl.textContent = s.site_subtitle;
    if (s.site_name) document.title = s.site_name;
    const headerLogoUrl = s.header_logo_url || s.logo_url;
    if (headerLogoUrl) {
        const logoWrapper = document.querySelector('#screen-home header .w-11');
        if (logoWrapper) logoWrapper.innerHTML = `<img src="${headerLogoUrl}" class="w-full h-full object-contain">`;
    }
    if (s.favicon_url) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = s.favicon_url;
    }
    if (s.primary_color) document.documentElement.style.setProperty('--brand-color', s.primary_color);
    if (s.home_section_gap !== undefined) document.documentElement.style.setProperty('--home-gap', s.home_section_gap + 'px');
    const _sectionGapMap = {gap_slider:'home-slider',gap_shortcuts:'home-col-shortcuts',gap_books:'home-books-section',gap_images:'home-media-images-section',gap_lectures:'home-col-lectures',gap_audio:'home-media-audio-section',gap_videos:'home-media-videos-section'};
    Object.entries(_sectionGapMap).forEach(([key, id]) => {
        const val = s[key];
        if (val !== undefined) { const el = document.getElementById(id); if (el) el.style.setProperty('margin-bottom', val + 'px', 'important'); }
    });
    if (s.gap_banner !== undefined) document.documentElement.style.setProperty('--banner-gap', s.gap_banner + 'px');
    const themeBtn = document.getElementById('global-theme-btn');
    if (themeBtn) {
        if (s.dark_mode_enabled === '0') themeBtn.style.display = 'none';
        else themeBtn.style.display = '';
    }
    const liveBanner = document.getElementById('home-live-banner');
    if (liveBanner) liveBanner.style.display = s.live_active === '1' ? '' : 'none';
    const liveTitle = document.getElementById('home-live-title');
    if (liveTitle) liveTitle.textContent = (s.live_banner_title && s.live_banner_title.trim()) || 'پخش زنده';
    const liveSub = document.getElementById('home-live-subtitle');
    if (liveSub) liveSub.textContent = (s.live_banner_subtitle && s.live_banner_subtitle.trim()) || 'برای مشاهده کلیک کنید';
    if (typeof setupLiveCountdown === 'function') setupLiveCountdown(s);
    window._siteSettings = s;
}

async function applySiteSettings() {
    // اعمال تنظیمات کش‌شده برای نمایش فوری
    try {
        const cachedSettings = localStorage.getItem('cached_site_settings');
        if (cachedSettings) applySettingsObject(JSON.parse(cachedSettings));
    } catch(e2) {}

    try {
        const r = await fetch('/api/settings');
        if (!r.ok) return;
        const s = await r.json();
        // کش کردن تنظیمات برای استفاده آفلاین
        try { localStorage.setItem('cached_site_settings', JSON.stringify(s)); } catch(e2) {}
        // ذخیره تنظیمات اسپلش برای اعمال فوری در بارگذاری بعدی
        const splashKeys = ['splash_bg_color','splash_title','splash_subtitle','splash_spinner_color','splash_icon_url'];
        const splashObj = {};
        splashKeys.forEach(k => { if (s[k] !== undefined) splashObj[k] = s[k]; });
        try { localStorage.setItem('_splashSettings', JSON.stringify(splashObj)); } catch(e2) {}
        applySettingsObject(s);
    } catch(e) {}
}

function openSettings() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    setTimeout(() => { document.getElementById('settings-overlay').style.opacity = '1'; }, 10);
    document.getElementById('settings-modal').style.transform = 'translateY(0)';
}

function closeSettings() {
    document.getElementById('settings-overlay').style.opacity = '0';
    document.getElementById('settings-modal').style.transform = 'translateY(100%)';
    setTimeout(() => { document.getElementById('settings-overlay').classList.add('hidden'); }, 300);
}

function setTheme(t) { currentTheme = t; localStorage.setItem('reader_theme', t); applyTheme(); }

function applyTheme() {
    ['reader-overlay', 'toc-overlay', 'screen-lectures', 'screen-news', 'screen-statements'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
        el.classList.add('theme-' + currentTheme);
    });
    ['light', 'sepia', 'dark'].forEach(t => {
        const b = document.getElementById('theme-btn-' + t);
        if (b) {
            b.classList.toggle('border-brand-500', t === currentTheme);
            b.classList.toggle('border-transparent', t !== currentTheme);
        }
    });
}

function setFont(f) { currentFont = f; localStorage.setItem('reader_font', f); applyFont(); }

function applyFont() {
    const tc = document.getElementById('text-content');
    if (tc) { tc.classList.remove('font-vazir', 'font-shabnam', 'font-tahoma'); tc.classList.add('font-' + currentFont); }
    const wpc = document.getElementById('single-post-content');
    if (wpc) { wpc.classList.remove('font-vazir', 'font-shabnam', 'font-tahoma'); wpc.classList.add('font-' + currentFont); }
    ['news-single-content', 'statements-single-content'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('font-vazir', 'font-shabnam', 'font-tahoma'); el.classList.add('font-' + currentFont); }
    });
    ['vazir', 'shabnam', 'tahoma'].forEach(f => {
        const b = document.getElementById('font-btn-' + f);
        if (!b) return;
        if (f === currentFont) {
            b.classList.add('bg-brand-50', 'shadow-sm', 'font-bold', 'text-brand-600', 'border', 'border-brand-200');
            b.classList.remove('text-gray-500', 'bg-white');
        } else {
            b.classList.remove('bg-brand-50', 'shadow-sm', 'font-bold', 'text-brand-600', 'border', 'border-brand-200');
            b.classList.add('text-gray-500', 'bg-white');
        }
    });
}

function changeFontSize(d) {
    fontSize = Math.max(14, Math.min(32, fontSize + d * 2));
    localStorage.setItem('reader_fontSize', fontSize);
    const tc = document.getElementById('text-content');
    if (tc) tc.style.fontSize = fontSize + 'px';
    ['single-post-content', 'news-single-content', 'statements-single-content'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.fontSize = fontSize + 'px';
    });
    document.getElementById('font-size-display').textContent = fontSize + 'px';
}

function changeLineHeight(d) {
    lineHeight = Math.max(1.0, Math.min(4.0, lineHeight + d));
    localStorage.setItem('reader_lineHeight', lineHeight);
    document.documentElement.style.setProperty('--line-height', lineHeight);
    document.getElementById('line-height-display').textContent = lineHeight.toFixed(1);
}

function updateTitleColorUI(c) {
    document.querySelectorAll('[data-title-color]').forEach(btn => {
        if (btn.dataset.titleColor === c) {
            btn.style.boxShadow = '0 0 0 3px white, 0 0 0 5px #64748b';
            btn.style.transform = 'scale(1.18)';
        } else {
            btn.style.boxShadow = '';
            btn.style.transform = '';
        }
    });
}

function setTitleColor(c) {
    document.documentElement.style.setProperty('--title-color', c);
    localStorage.setItem('reader_titleColor', c);
    updateTitleColorUI(c);
}

function updateTextColorUI(c) {
    document.querySelectorAll('[data-text-color]').forEach(btn => {
        if (btn.dataset.textColor === c) {
            btn.style.boxShadow = '0 0 0 3px white, 0 0 0 5px #64748b';
            btn.style.transform = 'scale(1.18)';
        } else {
            btn.style.boxShadow = '';
            btn.style.transform = '';
        }
    });
}

function setTextColor(c) {
    document.documentElement.style.setProperty('--text-color', c);
    localStorage.setItem('reader_textColor', c);
    updateTextColorUI(c);
}

function togglePageMenu(){document.getElementById('page-action-menu').classList.toggle('hidden');}
function copyPageText(){const p=bookData[currentIndex];if(!p)return;navigator.clipboard.writeText(p.name+'\n\n'+p.text.replace(/<[^>]*>/g,'')).then(()=>showToast('متن کپی شد'));document.getElementById('page-action-menu').classList.add('hidden');}

// ====================================================
// هایلایت کلمه جستجو (جستجوی سراسری)
// ====================================================
function _normIdxToOrigRange(origText, nf, normStart, normLen) {
    let ni = 0, origStart = 0, origEnd = origText.length, foundStart = false;
    for (let oi = 0; oi < origText.length; oi++) {
        if (ni === normStart && !foundStart) { origStart = oi; foundStart = true; }
        if (ni === normStart + normLen) { origEnd = oi; break; }
        ni += nf(origText[oi]).length;
    }
    if (!foundStart) origStart = 0;
    return [origStart, origEnd];
}

function applySearchHighlight() {
    const tc = document.getElementById('text-content');
    if (!tc || !_searchHighlightQuery) return;
    const query = _searchHighlightQuery;
    _searchHighlightQuery = null;
    const nf = (typeof _normFa === 'function') ? _normFa : (s => (s||'').toString().toLowerCase());
    const nq = nf(query);
    if (!nq || nq.length < 2) return;
    let firstMark = null, changed = true, iter = 0;
    while (changed && iter < 300) {
        changed = false; iter++;
        const walker = document.createTreeWalker(tc, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement && node.parentElement.tagName === 'MARK') continue;
            const origText = node.textContent;
            const ni = nf(origText).indexOf(nq);
            if (ni < 0) continue;
            const [os, oe] = _normIdxToOrigRange(origText, nf, ni, nq.length);
            const mark = document.createElement('mark');
            mark.style.cssText = 'background:#fde047;border-radius:3px;padding:0 2px;color:inherit;';
            mark.className = 'search-hl';
            mark.textContent = origText.slice(os, oe);
            const frag = document.createDocumentFragment();
            if (os > 0) frag.appendChild(document.createTextNode(origText.slice(0, os)));
            frag.appendChild(mark);
            if (oe < origText.length) frag.appendChild(document.createTextNode(origText.slice(oe)));
            node.parentNode.replaceChild(frag, node);
            if (!firstMark) firstMark = mark;
            changed = true; break;
        }
    }
    if (firstMark) setTimeout(() => firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
}

// ====================================================
// هایلایت متن
// ====================================================
let highlightData = {};

function getHighlightKey() { return `hl_${currentBookId}_${currentIndex}`; }
function loadHighlights() { const k = getHighlightKey(); highlightData[k] = JSON.parse(localStorage.getItem(k) || '[]'); }
function saveHighlights() { const k = getHighlightKey(); localStorage.setItem(k, JSON.stringify(highlightData[k] || [])); }

const HIGHLIGHT_CONTAINERS = ['text-content', 'single-post-content', 'news-single-content', 'statements-single-content'];

// ذخیره selection روی موبایل — فقط اگه selection فعال داریم ذخیره کن
let _savedRange = null;
function saveSelectionForMobile() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        _savedRange = sel.getRangeAt(0).cloneRange();
    }
    // اگه selection خالیه، _savedRange رو دست نزن — مقدار قبلی حفظ میشه
}
// ذخیره + پاک کردن selection → جلوگیری از منوی native مرورگر
function saveAndClearSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        _savedRange = sel.getRangeAt(0).cloneRange();
        sel.removeAllRanges();
    }
}
function restoreSelectionIfNeeded() {
    const sel = window.getSelection();
    if (sel && (sel.isCollapsed || sel.rangeCount === 0) && _savedRange) {
        sel.removeAllRanges();
        sel.addRange(_savedRange);
    }
}

function getHighlightContainer(node) {
    for (const id of HIGHLIGHT_CONTAINERS) {
        const el = document.getElementById(id);
        if (el && el.contains(node)) return el;
    }
    return null;
}

function applyHighlight(color) {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const tc = getHighlightContainer(range.commonAncestorContainer);
    if (!tc) return;

    const selectedText = range.toString().trim();
    if (!selectedText) return;

    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.borderRadius = '3px';
    mark.style.padding = '0 2px';
    mark.dataset.hlId = Date.now().toString();
    try {
        range.surroundContents(mark);
    } catch(e) {
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
    }
    sel.removeAllRanges();
    hideHighlightToolbar();

    if (tc.id === 'text-content') {
        const k = getHighlightKey();
        if (!highlightData[k]) highlightData[k] = [];
        // ذخیره متن واقعی برای بازیابی در صفحات بعد
        highlightData[k].push({ text: selectedText, color, id: mark.dataset.hlId });
        saveHighlights();
    }
    showToast('هایلایت اعمال شد');
}

function removeHighlight() {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // اگه روی mark کلیک شده یا داخلشه
        let markEl = range.commonAncestorContainer;
        if (markEl.nodeType === Node.TEXT_NODE) markEl = markEl.parentElement;
        while (markEl && markEl.tagName !== 'MARK') markEl = markEl.parentElement;

        if (markEl && markEl.tagName === 'MARK') {
            const hlId = markEl.dataset.hlId;
            const parent = markEl.parentNode;
            while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
            parent.removeChild(markEl);
            // حذف از localStorage
            const k = getHighlightKey();
            const data = JSON.parse(localStorage.getItem(k) || '[]');
            const updated = data.filter(h => h.id !== hlId && h.text !== markEl.textContent);
            localStorage.setItem(k, JSON.stringify(updated));
            if (highlightData[k]) highlightData[k] = updated;
        }
        sel.removeAllRanges();
    }
    hideHighlightToolbar();
    showToast('هایلایت حذف شد');
}

// بازیابی هایلایت‌ها بعد از رندر صفحه
function applyHighlightsToPage() {
    const tc = document.getElementById('text-content');
    if (!tc) return;
    const k = getHighlightKey();
    const data = JSON.parse(localStorage.getItem(k) || '[]');
    if (!data.length) return;
    highlightData[k] = data;

    data.forEach(({ text, color }) => {
        if (!text || text.length < 2) return;
        _restoreHighlight(tc, text, color);
    });
}

// پیدا کردن متن در سراسر node‌ها (حتی اگه چند node رو پوشش بده)
function _restoreHighlight(tc, text, color) {
    // کل متن خام را بساز (بدون MARK‌ها)
    const nodes = [];
    const walker = document.createTreeWalker(tc, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.tagName === 'MARK') continue;
        nodes.push(node);
    }

    // متن کامل رو از همه nodeها بساز و موقعیت هر node رو ردیابی کن
    let fullText = '';
    const offsets = []; // شروع هر node در fullText
    nodes.forEach(n => { offsets.push(fullText.length); fullText += n.textContent; });

    const idx = fullText.indexOf(text);
    if (idx < 0) return;

    const endIdx = idx + text.length;

    // node شروع و پایان رو پیدا کن
    let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
    for (let i = 0; i < nodes.length; i++) {
        const nStart = offsets[i];
        const nEnd = nStart + nodes[i].textContent.length;
        if (!startNode && nEnd > idx) {
            startNode = nodes[i];
            startOffset = idx - nStart;
        }
        if (nEnd >= endIdx) {
            endNode = nodes[i];
            endOffset = endIdx - nStart;
            break;
        }
    }
    if (!startNode || !endNode) return;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.borderRadius = '3px';
    mark.style.padding = '0 2px';
    mark.dataset.hlId = 'restored_' + Date.now();
    try {
        range.surroundContents(mark);
    } catch(e) {
        // اگه متن روی چند element بود از extractContents استفاده کن
        try { const frag = range.extractContents(); mark.appendChild(frag); range.insertNode(mark); } catch(e2) {}
    }
}

function copySelectedText() {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideHighlightToolbar(); return; }
    const text = sel.toString().trim();
    if (!text) { hideHighlightToolbar(); return; }
    hideHighlightToolbar();
    sel.removeAllRanges();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('متن کپی شد')).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); showToast('متن کپی شد');
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showToast('متن کپی شد');
    }
}

async function shareSelectedText() {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideHighlightToolbar(); return; }
    const text = sel.toString().trim();
    if (!text) { hideHighlightToolbar(); return; }
    hideHighlightToolbar();
    sel.removeAllRanges();

    let title = document.title;
    const headerTitle = document.getElementById('lectures-header-title') ||
                        document.getElementById('news-header-title') ||
                        document.getElementById('statements-header-title');
    if (headerTitle && headerTitle.textContent.trim()) title = headerTitle.textContent.trim();

    const shareText = `«${text}»\n\n— ${title}`;

    if (navigator.share) {
        try { await navigator.share({ title, text: shareText }); return; }
        catch(e) { if (e.name === 'AbortError') return; }
    }

    try {
        await navigator.clipboard.writeText(shareText);
        showToast('متن کپی شد');
    } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = shareText; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showToast('متن کپی شد');
    }
}

// ====================================================
// انتشار به صورت عکس (Spotify-style quote card)
// ====================================================
let _shareImageText = '';
let _shareImageSubtitle = '';
let _shareHue = 220; // مقدار پیش‌فرض: آبی تیره
let _shareStoryMode = false; // false = 1:1 square, true = 9:16 story
let _shareBgImage = null; // HTMLImageElement or null
let _shareCustomText = ''; // custom text at bottom

function getShareTitle() {
    const ids = ['book-main-title','toc-book-title','reader-book-title','lectures-header-title','news-header-title','statements-header-title'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return document.title || 'دستغیب قبا';
}

function onShareHueChange(val) {
    _shareHue = parseInt(val);
    // به‌روزرسانی نشانگر روی طیف
    const ind = document.getElementById('share-hue-indicator');
    if (ind) {
        ind.style.left = `calc(${_shareHue}/359*100%)`;
        ind.style.background = `hsl(${_shareHue},60%,30%)`;
    }
    _renderShareCanvas();
}

function shareSelectedTextAsImage() {
    restoreSelectionIfNeeded();
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text) { hideHighlightToolbar(); return; }
    _shareImageText = text;
    _shareImageSubtitle = '';
    hideHighlightToolbar();
    if (sel) sel.removeAllRanges();

    _shareHue = 220;
    _shareStoryMode = false;
    _shareBgImage = null;
    _shareCustomText = '';

    const slider = document.getElementById('share-hue-slider');
    if (slider) slider.value = 220;
    const customInput = document.getElementById('share-custom-text');
    if (customInput) customInput.value = '';
    const bgInput = document.getElementById('share-bg-input');
    if (bgInput) bgInput.value = '';
    const clearBtn = document.getElementById('share-bg-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    setShareSize('square');
    onShareHueChange(220);
    document.getElementById('share-image-modal').classList.remove('hidden');
}

function setShareSize(mode) {
    _shareStoryMode = (mode === 'story');
    const sqBtn = document.getElementById('share-size-square');
    const stBtn = document.getElementById('share-size-story');
    if (sqBtn && stBtn) {
        if (_shareStoryMode) {
            sqBtn.classList.remove('bg-white', 'shadow-sm', 'text-gray-800');
            sqBtn.classList.add('text-gray-500');
            stBtn.classList.add('bg-white', 'shadow-sm', 'text-gray-800');
            stBtn.classList.remove('text-gray-500');
        } else {
            stBtn.classList.remove('bg-white', 'shadow-sm', 'text-gray-800');
            stBtn.classList.add('text-gray-500');
            sqBtn.classList.add('bg-white', 'shadow-sm', 'text-gray-800');
            sqBtn.classList.remove('text-gray-500');
        }
    }
    _renderShareCanvas();
}

function onShareBgImagePick(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            _shareBgImage = img;
            const clearBtn = document.getElementById('share-bg-clear-btn');
            if (clearBtn) clearBtn.classList.remove('hidden');
            const bgColorSection = document.getElementById('share-bg-color-section');
            if (bgColorSection) bgColorSection.style.opacity = '0.4';
            _renderShareCanvas();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearShareBgImage() {
    _shareBgImage = null;
    const bgInput = document.getElementById('share-bg-input');
    if (bgInput) bgInput.value = '';
    const clearBtn = document.getElementById('share-bg-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const bgColorSection = document.getElementById('share-bg-color-section');
    if (bgColorSection) bgColorSection.style.opacity = '1';
    _renderShareCanvas();
}

function onShareCustomTextChange(val) {
    _shareCustomText = val.trim();
    _renderShareCanvas();
}

function _renderShareCanvas() {
    const canvas = document.getElementById('share-canvas');
    if (!canvas) return;
    const h = _shareHue;
    const W = 1080;
    const H = _shareStoryMode ? 1920 : 1080;
    canvas.width = W; canvas.height = H;

    // update canvas CSS aspect ratio
    canvas.style.aspectRatio = _shareStoryMode ? '9/16' : '1/1';

    const ctx = canvas.getContext('2d');

    if (_shareBgImage) {
        // پس‌زمینه تصویری با crop مرکزی
        const imgRatio = _shareBgImage.width / _shareBgImage.height;
        const canvasRatio = W / H;
        let sx, sy, sw, sh;
        if (imgRatio > canvasRatio) {
            sh = _shareBgImage.height;
            sw = sh * canvasRatio;
            sx = (_shareBgImage.width - sw) / 2;
            sy = 0;
        } else {
            sw = _shareBgImage.width;
            sh = sw / canvasRatio;
            sx = 0;
            sy = (_shareBgImage.height - sh) / 2;
        }
        ctx.drawImage(_shareBgImage, sx, sy, sw, sh, 0, 0, W, H);
        // لایه تاری روی عکس برای خوانایی متن
        ctx.fillStyle = 'rgba(0,0,0,0.52)';
        ctx.fillRect(0, 0, W, H);
    } else {
        // پس‌زمینه گرادیان بر اساس hue انتخابی
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0,    `hsl(${h},65%,10%)`);
        g.addColorStop(0.5,  `hsl(${(h+20)%360},60%,17%)`);
        g.addColorStop(1,    `hsl(${(h+40)%360},55%,22%)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // دایره‌های تزئینی
    ctx.beginPath(); ctx.arc(W * 0.88, H * 0.12, W * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${h},70%,55%,0.15)`; ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.12, H * 0.88, W * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${(h+40)%360},70%,55%,0.10)`; ctx.fill();

    // گیومه تزئینی
    ctx.save();
    ctx.font = `bold ${W * 0.18}px 'Vazir', 'Tahoma', serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    ctx.fillText('»', W - 55, H * 0.18);
    ctx.restore();

    // متن اصلی - در استوری جای بیشتری داریم
    const fontSize = _calcFontSize(ctx, _shareImageText, W);
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Vazir', 'Tahoma', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    const maxW = W * 0.80;
    const lineH = fontSize * 1.7;
    const lines = _wrapText(ctx, _shareImageText, maxW);
    const totalH = lines.length * lineH;
    // در استوری متن در وسط، در مربع هم وسط
    const centerY = _shareStoryMode ? H * 0.45 : H * 0.5;
    let startY = centerY - totalH / 2 + fontSize * 0.8;
    if (startY < H * 0.18) startY = H * 0.18;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineH));
    ctx.restore();

    // خط جداکننده
    const afterY = startY + lines.length * lineH + W * 0.045;
    ctx.beginPath();
    ctx.moveTo(W * 0.38, afterY); ctx.lineTo(W * 0.62, afterY);
    ctx.strokeStyle = `hsla(${h},60%,75%,0.35)`; ctx.lineWidth = 1.5; ctx.stroke();

    // عنوان کتاب
    if (_shareImageSubtitle) {
        ctx.save();
        ctx.font = `${W * 0.03}px 'Vazir', 'Tahoma', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'center'; ctx.direction = 'rtl';
        ctx.fillText(_shareImageSubtitle, W / 2, afterY + W * 0.055);
        ctx.restore();
    }

    // متن دلخواه کاربر (پایین تصویر)
    if (_shareCustomText) {
        ctx.save();
        ctx.font = `bold ${W * 0.032}px 'Vazir', 'Tahoma', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.textAlign = 'center'; ctx.direction = 'rtl';
        ctx.fillText(_shareCustomText, W / 2, H - W * 0.10);
        ctx.restore();
    }

    // برند پایین
    ctx.save();
    ctx.font = `bold ${W * 0.026}px 'Vazir', 'Tahoma', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText('dastgheibqoba.info', W / 2, H - W * 0.045);
    ctx.restore();
}

function _calcFontSize(ctx, text, W) {
    // شروع از فونت بزرگ، کوچک‌تر کن تا بشه جا داد
    const maxW = W * 0.80;
    const maxLines = 12;
    for (let fs = W * 0.058; fs >= W * 0.022; fs -= 2) {
        ctx.font = `bold ${fs}px 'Vazir', 'Tahoma', sans-serif`;
        const lines = _wrapText(ctx, text, maxW);
        if (lines.length <= maxLines) return fs;
    }
    return W * 0.022;
}

function _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && cur) {
            lines.push(cur); cur = w;
        } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 12);
}

function closeShareImageModal() {
    document.getElementById('share-image-modal').classList.add('hidden');
}

function downloadShareImage() {
    const canvas = document.getElementById('share-canvas');
    const a = document.createElement('a');
    a.download = 'quote-dastgheibqoba.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
}

async function shareShareImage() {
    const canvas = document.getElementById('share-canvas');
    canvas.toBlob(async (blob) => {
        if (!blob) return;
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'quote.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], title: _shareImageSubtitle || 'نقل قول' }); return; }
                catch(e) { if (e.name === 'AbortError') return; }
            }
        }
        // Fallback: باز کردن عکس در تب جدید
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'image/png');
}

function showHighlightToolbar(x, y, isMobile = false) {
    const tb = document.getElementById('highlight-toolbar');
    if (!tb) return;
    saveSelectionForMobile();
    if (isMobile) {
        // موبایل: bottom bar ثابت پایین صفحه — تداخل با native menu نداره
        tb.style.left = '50%';
        tb.style.top = '';
        tb.style.bottom = '72px';
        tb.style.transform = 'translateX(-50%)';
    } else {
        // دسکتاپ: بالای selection
        tb.style.bottom = '';
        tb.style.transform = 'translateX(-50%)';
        requestAnimationFrame(() => {
            const tbH = tb.offsetHeight || 44;
            const tbW = tb.offsetWidth || 260;
            const clampedX = Math.max(tbW / 2 + 8, Math.min(x, window.innerWidth - tbW / 2 - 8));
            tb.style.left = clampedX + 'px';
            tb.style.top = Math.max(10, y - tbH - 10) + 'px';
        });
    }
    tb.classList.remove('hidden');
}

function hideHighlightToolbar() {
    const tb = document.getElementById('highlight-toolbar');
    if (tb) tb.classList.add('hidden');
}
