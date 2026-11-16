const { Level, Recitation } = require('../models');
const { getSettings, scoreMap } = require('./settings');
const { computeProgress } = require('./progressCalc');

const idOf = (x) => (x && x._id ? String(x._id) : x ? String(x) : null);

// تقدّم الطالب في مستوى تسجيله (لكل تسجيل تقدّمه المستقل): الحفظ والمراجعة بحساب مستقل لكل منهما،
// من سجلات «بالسورة والآيات» لسور المستوى (التسميع بالصفحات لا يدخل). التفاصيل والقواعد في progressCalc.js
async function progressFor(enrollments, { detail = false } = {}) {
  const levelIds = [...new Set(enrollments.map((s) => idOf(s.levelId)).filter(Boolean))];
  if (!levelIds.length) return new Map();
  const levels = await Level.find({ _id: { $in: levelIds } }).select('surahs').lean();
  const lm = new Map(levels.filter((l) => l.surahs?.length).map((l) => [String(l._id), l.surahs]));
  const target = enrollments.filter((s) => lm.has(idOf(s.levelId)));
  if (!target.length) return new Map();

  const scores = scoreMap(await getSettings());
  const recs = await Recitation.find({ enrollmentId: { $in: target.map((s) => s._id) }, mode: 'surah' })
    .select('enrollmentId type surah fromAyah toAyah grade').lean();
  const by = new Map();
  recs.forEach((r) => { const k = String(r.enrollmentId); (by.get(k) || by.set(k, []).get(k)).push(r); });

  const out = new Map();
  for (const s of target) {
    const mine = by.get(String(s._id)) || [];
    out.set(String(s._id), computeProgress(
      lm.get(idOf(s.levelId)),
      mine.filter((r) => r.type === 'hifz'),
      mine.filter((r) => r.type === 'review'),
      scores,
      { detail },
    ));
  }
  return out;
}

module.exports = { progressFor };
