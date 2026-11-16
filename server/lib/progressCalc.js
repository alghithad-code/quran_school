// حساب تقدّم الحفظ والمراجعة (دوال نقية بلا قاعدة بيانات، لسهولة الاختبار).
// القاعدة: الآيات الفريدة فقط تُحتسب (تكرار الآية لا يزيد النسبة)، والنسب تعتمد على مجموع الآيات لا متوسط نسب السور.
const { SURAHS } = require('../data/quran');

// يحوّل مقاطع (من/إلى) إلى خريطة آيات فريدة لكل سورة
function coverFrom(recs, surahSet, skip = () => false) {
  const cover = new Map();
  for (const r of recs) {
    if (!surahSet.has(r.surah) || skip(r)) continue;
    const max = SURAHS[r.surah - 1].ayahs;
    if (!cover.has(r.surah)) cover.set(r.surah, new Uint8Array(max + 1));
    const arr = cover.get(r.surah);
    for (let a = Math.max(1, r.fromAyah); a <= Math.min(max, r.toAyah); a += 1) arr[a] = 1;
  }
  return cover;
}

function rangesOf(arr, ayahs) {
  const ranges = [];
  for (let a = 1; a <= ayahs; a += 1) {
    if (!arr[a]) continue;
    let b = a;
    while (b + 1 <= ayahs && arr[b + 1]) b += 1;
    ranges.push([a, b]);
    a = b;
  }
  return ranges;
}

const count = (arr) => (arr ? arr.reduce((x, y) => x + y, 0) : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// surahs: سور المستوى. hifzRecs/reviewRecs: سجلات بالسورة والآيات. scores: مفتاح التقييم → درجته.
// الحفظ: التقييم الذي درجته 0 («يحتاج إلى إعادة») لا يُحتسب. المراجعة: كل آية روجعت تُحتسب مرة واحدة.
function computeProgress(surahs, hifzRecs, reviewRecs, scores, { detail = false } = {}) {
  const set = new Set(surahs);
  const hifz = coverFrom(hifzRecs, set, (r) => r.grade && r.grade in scores && scores[r.grade] <= 0);
  const review = coverFrom(reviewRecs, set);
  let memorized = 0, reviewed = 0, total = 0;
  const per = surahs.map((n) => {
    const ayahs = SURAHS[n - 1].ayahs;
    const m = count(hifz.get(n)), v = count(review.get(n));
    memorized += m; reviewed += v; total += ayahs;
    return {
      surah: n, name: SURAHS[n - 1].name, total: ayahs,
      memorized: m, ranges: m ? rangesOf(hifz.get(n), ayahs) : [],
      reviewed: v, reviewRanges: v ? rangesOf(review.get(n), ayahs) : [],
    };
  });
  return {
    memorized, total, pct: pct(memorized, total), // الحفظ (الحقول القديمة كما هي)
    review: { reviewed, total, pct: pct(reviewed, total) },
    ...(detail ? { surahs: per } : {}),
  };
}

module.exports = { computeProgress };
