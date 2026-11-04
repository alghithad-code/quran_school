const fs = require('fs');
const path = require('path');
const { SURAHS } = require('../data/quran');

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

module.exports = { getSurah, verse, available: () => !!load() };
