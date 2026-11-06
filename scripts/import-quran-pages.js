// يولّد server/data/quran-pages.json (بدايات صفحات المصحف الـ604) من ملف تنزيل الرسمي quran-data.js
// الاستخدام:  npm run import:pages -- /المسار/quran-data.js
// حمّل الملف من https://tanzil.net/res/text/metadata/quran-data.js (بترخيص تنزيل نفسه، ويُذكر المصدر).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { SURAHS } = require('../server/data/quran');
const { JUZ_STARTS } = require('../server/data/quranMeta');

const src = process.argv[2];
if (!src) { console.error('الاستخدام: npm run import:pages -- /المسار/quran-data.js'); process.exit(1); }

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src, 'utf8') + '\n;this.__QD = typeof QuranData !== "undefined" ? QuranData : null;', ctx);
const qd = ctx.__QD;
if (!qd || !Array.isArray(qd.Page)) { console.error('لم أجد QuranData.Page في الملف'); process.exit(1); }

const pairs = qd.Page.filter((e) => Array.isArray(e) && e.length >= 2).map(([s, a]) => [Number(s), Number(a)]);
let prev = 0;
const problems = [];
if (pairs.length !== 604) problems.push(`عدد الصفحات ${pairs.length} وليس 604`);
pairs.forEach(([s, a], i) => {
  const key = s * 1000 + a;
  if (!SURAHS[s - 1] || a < 1 || a > SURAHS[s - 1].ayahs) problems.push(`صفحة ${i + 1}: موضع غير صحيح ${s}:${a}`);
  if (key <= prev) problems.push(`صفحة ${i + 1}: الترتيب غير تصاعدي`);
  prev = key;
});
if (pairs[0] && (pairs[0][0] !== 1 || pairs[0][1] !== 1)) problems.push('الصفحة 1 يجب أن تبدأ من 1:1');
if (problems.length) { console.error('فشل التحقق:\n- ' + problems.slice(0, 10).join('\n- ')); process.exit(1); }

// مقارنة استرشادية لبدايات الأجزاء مع ما في الملف (إن وجدت)
if (Array.isArray(qd.Juz)) {
  const juz = qd.Juz.filter((e) => Array.isArray(e) && e.length >= 2);
  const diff = JUZ_STARTS.map((j, i) => (juz[i] && (juz[i][0] !== j[0] || juz[i][1] !== j[1]) ? `جزء ${i + 1}: عندنا ${j.join(':')} وفي ملف تنزيل ${juz[i].join(':')}` : null)).filter(Boolean);
  console.log(diff.length ? 'تنبيه: اختلاف في بدايات الأجزاء:\n- ' + diff.join('\n- ') : 'بدايات الأجزاء مطابقة لملف تنزيل ✓');
}

fs.writeFileSync(path.join(__dirname, '..', 'server', 'data', 'quran-pages.json'), JSON.stringify(pairs));
console.log('تم إنشاء server/data/quran-pages.json (604 صفحة). أعد النشر ليظهر التنقل بالصفحات.');
