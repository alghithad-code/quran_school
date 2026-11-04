const { Level, Recitation } = require('../models');
const { getSettings, scoreMap } = require('./settings');
const { SURAHS } = require('../data/quran');

const idOf = (x) => (x && x._id ? String(x._id) : x ? String(x) : null);

// تقدّم الطالب في مستوى تسجيله (لكل تسجيل تقدّمه المستقل): نسبة الآيات المحفوظة من سور المستوى، من سجلات «الحفظ» بالسورة والآيات.
// التقييم الذي درجته 0 («يحتاج إلى إعادة») لا يُحتسب حفظاً. التسميع بالصفحات لا يدخل في الحساب.
async function progressFor(enrollments, { detail = false } = {}) {
  const levelIds = [...new Set(enrollments.map((s) => idOf(s.levelId)).filter(Boolean))];
  if (!levelIds.length) return new Map();
  const levels = await Level.find({ _id: { $in: levelIds } }).select('surahs').lean();
  const lm = new Map(levels.filter((l) => l.surahs?.length).map((l) => [String(l._id), l.surahs]));
  const target = enrollments.filter((s) => lm.has(idOf(s.levelId)));
  if (!target.length) return new Map();

  const scores = scoreMap(await getSettings());
  const recs = await Recitation.find({ enrollmentId: { $in: target.map((s) => s._id) }, type: 'hifz', mode: 'surah' })
    .select('enrollmentId surah fromAyah toAyah grade').lean();
  const by = new Map();
  recs.forEach((r) => { const k = String(r.enrollmentId); (by.get(k) || by.set(k, []).get(k)).push(r); });

  const out = new Map();
  for (const s of target) {
    const surahs = lm.get(idOf(s.levelId));
    const set = new Set(surahs);
    const cover = new Map();
    for (const r of by.get(String(s._id)) || []) {
      if (!set.has(r.surah)) continue;
      if (r.grade && r.grade in scores && scores[r.grade] <= 0) continue;
      const max = SURAHS[r.surah - 1].ayahs;
      if (!cover.has(r.surah)) cover.set(r.surah, new Uint8Array(max + 1));
      const arr = cover.get(r.surah);
      for (let a = Math.max(1, r.fromAyah); a <= Math.min(max, r.toAyah); a += 1) arr[a] = 1;
    }
    let memorized = 0, total = 0;
    const per = surahs.map((n) => {
      const ayahs = SURAHS[n - 1].ayahs;
      const m = cover.has(n) ? cover.get(n).reduce((a, b) => a + b, 0) : 0;
      memorized += m; total += ayahs;
      const ranges = [];
      if (m) {
        const arr = cover.get(n);
        for (let a = 1; a <= ayahs; a += 1) {
          if (!arr[a]) continue;
          let b = a;
          while (b + 1 <= ayahs && arr[b + 1]) b += 1;
          ranges.push([a, b]);
          a = b;
        }
      }
      return { surah: n, name: SURAHS[n - 1].name, memorized: m, total: ayahs, ranges };
    });
    out.set(String(s._id), { memorized, total, pct: total ? Math.round((memorized / total) * 1000) / 10 : 0, ...(detail ? { surahs: per } : {}) });
  }
  return out;
}

module.exports = { progressFor };
