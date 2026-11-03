const { Attendance, Recitation } = require('../models');
const { getSettings, scoreMap } = require('./settings');

const ayahsOf = (r) => (r.mode === 'surah' ? r.toAyah - r.fromAyah + 1 : 0);
const pagesOf = (r) => (r.mode === 'page' ? r.toPage - r.fromPage + 1 : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null);

// إحصائيات مجموعة تسجيلات خلال فترة: خريطة enrollmentId -> إحصائيات (حضور مستقل لكل تسجيل)
async function statsFor(enrollmentIds, from, to) {
  const settings = await getSettings();
  const scores = scoreMap(settings);
  const q = { enrollmentId: { $in: enrollmentIds }, date: { $gte: from, $lte: to } };
  const [att, rec] = await Promise.all([
    Attendance.find(q).select('enrollmentId studentId status date').lean(),
    Recitation.find(q).select('enrollmentId type mode fromAyah toAyah fromPage toPage grade').lean(),
  ]);
  const out = new Map();
  const get = (id) => {
    const k = String(id);
    if (!out.has(k)) out.set(k, { present: 0, absent: 0, hifz: { count: 0, ayahs: 0, pages: 0, scores: [], grades: {} }, review: { count: 0, ayahs: 0, pages: 0, scores: [], grades: {} } });
    return out.get(k);
  };
  enrollmentIds.forEach(get);
  att.forEach((a) => { get(a.enrollmentId)[a.status] += 1; });
  rec.forEach((r) => {
    const b = get(r.enrollmentId)[r.type];
    b.count += 1; b.ayahs += ayahsOf(r); b.pages += pagesOf(r);
    if (r.grade) { b.grades[r.grade] = (b.grades[r.grade] || 0) + 1; if (r.grade in scores) b.scores.push(scores[r.grade]); }
  });
  out.forEach((s) => {
    s.rate = pct(s.present, s.present + s.absent);
    s.hifz.avg = avg(s.hifz.scores); s.review.avg = avg(s.review.scores);
  });
  return { stats: out, settings, attRows: att, recRows: rec };
}

module.exports = { statsFor, pct, avg, ayahsOf, pagesOf };
