const fs = require('fs');
const path = require('path');
const { SURAHS } = require('../data/quran');
const { JUZ_STARTS } = require('../data/quranMeta');

// نص القرآن (الرسم العثماني) من مشروع تنزيل Tanzil — النسخة الأصلية دون أي تعديل.
// الترخيص: Creative Commons Attribution 3.0؛ يجب ذكر المصدر والرابط tanzil.net (يظهر في نافذة القراءة)،
// ويبقى ملف server/data/quran-uthmani.txt كما هو مع كتلة حقوق النشر في أعلاه.
let cache = null;
let loadError = null;

function load() {
  if (cache || loadError) return cache;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'quran-uthmani.txt'), 'utf8');
    const surahs = SURAHS.map(() => []);
    for (const line of raw.split(/\r?\n/)) {
      const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
      if (m) surahs[Number(m[1]) - 1][Number(m[2]) - 1] = m[3];
    }
    // التحقق: عدد آيات كل سورة مطابق للمصحف وبلا ثغرات
    SURAHS.forEach((s, i) => {
      if (surahs[i].length !== s.ayahs || surahs[i].some((t) => !t)) throw new Error(`نص سورة ${s.name} غير مكتمل`);
    });
    cache = { surahs, basmalah: surahs[0][0] };
  } catch (err) {
    loadError = err;
    console.error('تعذّر تحميل نص القرآن:', err.message);
  }
  return cache;
}

// الآيات كما في الملف حرفياً. الآية الأولى في كل سورة (عدا الفاتحة والتوبة) يسبقها نص البسملة في الملف نفسه.
function getSurah(n) {
  const q = load();
  if (!q || !Number.isInteger(n) || n < 1 || n > 114) return null;
  const ayahs = q.surahs[n - 1];
  return { surah: n, name: SURAHS[n - 1].name, ayahs, basmalah: n !== 1 && ayahs[0].startsWith(q.basmalah) ? q.basmalah : null };
}

const verse = (s, a) => load()?.surahs[s - 1]?.[a - 1] || null;

// ---------- فهرس الأجزاء والصفحات ----------
// بدايات الأجزاء مضمّنة ومتحقق منها؛ بدايات الصفحات (604) اختيارية من ملف data/quran-pages.json
// (يُولَّد من ملف تنزيل الرسمي بالأمر: npm run import:pages -- <المسار>/quran-data.js). إن لم يوجد يُخفى التنقل بالصفحات.
let pageStarts;
function pages() {
  if (pageStarts !== undefined) return pageStarts;
  pageStarts = null;
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'quran-pages.json'), 'utf8'));
    let prev = 0;
    const ok = Array.isArray(arr) && arr.length === 604 && arr.every(([s, a]) => {
      const key = s * 1000 + a;
      const valid = SURAHS[s - 1] && a >= 1 && a <= SURAHS[s - 1].ayahs && key > prev;
      prev = key;
      return valid;
    }) && arr[0][0] === 1 && arr[0][1] === 1;
    if (ok) pageStarts = arr; else console.error('quran-pages.json غير صالح، سيُتجاهل');
  } catch (e) { if (e.code !== 'ENOENT') console.error('quran-pages.json:', e.message); }
  return pageStarts;
}

// ---------- البحث: تطبيع الحروف (إزالة التشكيل وعلامات التلاوة وتوحيد الألف والهمزات) ----------
const norm = (t) => String(t || '')
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF\u06DE\u06E9]/g, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي').replace(/ة/g, 'ه')
  .replace(/ا/g, '') // الألف تُحذف من الطرفين: العالمين = العلمين
  .replace(/\s+/g, ' ').trim();

let index = null;
function buildIndex() {
  if (index) return index;
  const q = load();
  if (!q) return null;
  index = q.surahs.map((ays) => ays.map((t, i) => norm(i === 0 && t.startsWith(q.basmalah) && t !== q.basmalah ? t.slice(q.basmalah.length) : t)));
  return index;
}

function search(query, limit = 30) {
  const nq = norm(query);
  if (nq.length < 2) return { surahs: [], ayahs: [] };
  const surahs = SURAHS.map((s, i) => ({ surah: i + 1, name: s.name, n: norm(s.name) }))
    .filter((s) => s.n.includes(nq)).slice(0, 10).map(({ surah, name }) => ({ surah, name }));
  const idx = buildIndex();
  const ayahs = [];
  if (idx) {
    outer: for (let s = 0; s < idx.length; s += 1) {
      for (let a = 0; a < idx[s].length; a += 1) {
        if (idx[s][a].includes(nq)) {
          ayahs.push({ surah: s + 1, name: SURAHS[s].name, ayah: a + 1, text: load().surahs[s][a] });
          if (ayahs.length >= limit) break outer;
        }
      }
    }
  }
  return { surahs, ayahs };
}

module.exports = { getSurah, verse, search, pages, JUZ_STARTS, available: () => !!load() };
