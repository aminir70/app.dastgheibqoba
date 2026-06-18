// ====================================================
// آفلاین خوانی - ذخیره کتاب در IndexedDB
// ====================================================

const OFFLINE_DB_NAME = 'nashr-offline-v1';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = 'books';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
                db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveBookOffline(bookMeta, pages) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readwrite');
        tx.objectStore(OFFLINE_STORE).put({
            id: bookMeta.id,
            title: bookMeta.title,
            author: bookMeta.author || '',
            cover: bookMeta.cover || '',
            page_count: pages.length,
            pages,
            savedAt: Date.now()
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function getOfflineBook(bookId) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const req = tx.objectStore(OFFLINE_STORE).get(+bookId);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function deleteOfflineBook(bookId) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readwrite');
        tx.objectStore(OFFLINE_STORE).delete(+bookId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function getAllOfflineBooks() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const req = tx.objectStore(OFFLINE_STORE).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

// Set ایدی‌های دانلود شده (برای رندر سریع کارت‌ها)
let _offlineBookIds = new Set();
async function loadOfflineBookIds() {
    try {
        const books = await getAllOfflineBooks();
        _offlineBookIds = new Set(books.map(b => b.id));
    } catch(e) { _offlineBookIds = new Set(); }
}
loadOfflineBookIds();

function isBookOffline(bookId) { return _offlineBookIds.has(+bookId); }

// دانلود کتاب با progress callback
async function downloadBookForOffline(bookId, onProgress) {
    const bookMeta = allBooks.find(b => b.id == bookId);
    if (!bookMeta) throw new Error('کتاب یافت نشد');

    onProgress && onProgress(10, 'دریافت اطلاعات...');
    const r = await fetch('/api/books/' + bookId + '/pages');
    if (!r.ok) throw new Error('خطا در دریافت کتاب');

    onProgress && onProgress(60, 'ذخیره صفحات...');
    const pages = await r.json();

    onProgress && onProgress(90, 'ذخیره در حافظه...');
    await saveBookOffline(bookMeta, pages);
    _offlineBookIds.add(+bookId);

    onProgress && onProgress(100, 'انجام شد');
    return pages.length;
}

// حذف کتاب از حافظه آفلاین
async function removeOfflineBook(bookId) {
    await deleteOfflineBook(bookId);
    _offlineBookIds.delete(+bookId);
}
