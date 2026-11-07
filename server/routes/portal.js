const express = require('express');
const { Student, Enrollment, Attendance, Recitation, Note, LevelChange } = require('../models');
const { requireAnyAuth } = require('../middleware/auth');
const { progressFor } = require('../lib/progress');
const { getSettings } = require('../lib/settings');
const { SURAHS } = require('../data/quran');
const { todayStr, addDays, weekday } = require('../utils/dates');

// بوابة الطالب: قراءة فقط، وكل ما فيها يخص الطالب صاحب الحساب وحده (المعرّف من الجلسة لا من الطلب).
// لا يخرج منها: ملاحظات المشرف العامة، ولا ملاحظات المعلم غير المحدّدة «مرئية للطالب»، ولا ملاحظات الغياب، ولا هواتف أو معرّفات الآخرين.
const router = express.Router();
router.use(requireAnyAuth, (req, res, next) => (req.user.role === 'student' && req.user.studentId ? next() : res.status(403).json({ error: 'هذه الصفحة للطلاب فقط' })));

const RECENT_ATT = 30;
const RECENT_REC = 40;

// أقرب جلسة قادمة من أيام الحلقة (اليوم يُحتسب)
function nextSession(days, from) {
  if (!days?.length) return null;
  const set = new Set(days);
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(from, i);
    if (set.has(weekday(d))) return { date: d, inDays: i };
  }
  return null;
}

const group = (rows) => {
  const m = new Map();
  for (const r of rows) { const k = String(r.enrollmentId); (m.get(k) || m.set(k, []).get(k)).push(r); }
  return m;
};

router.get('/me', async (req, res, next) => {
  try {
    const student = await Student.findById(req.user.studentId).select('name age enrolledAt').lean();
    if (!student) return res.status(404).json({ error: 'غير موجود' });
    const today = todayStr();

    const enrollments = await Enrollment.find({ studentId: student._id })
      .populate('levelId', 'name').populate('teacherId', 'name').lean();
    // الحالية أولاً ثم السابقة (الأحدث أولاً)
    enrollments.sort((a, b) => (a.status === b.status ? String(b.startedAt || '').localeCompare(String(a.startedAt || '')) : a.status === 'active' ? -1 : 1));
    const ids = enrollments.map((e) => e._id);

    const [settings, prog, attRecent, attCounts, recs, notes, changes] = await Promise.all([
      getSettings(),
      progressFor(enrollments.map((e) => ({ _id: e._id, levelId: e.levelId })), { detail: true }),
      Attendance.find({ enrollmentId: { $in: ids } }).sort({ date: -1 }).limit(600).select('enrollmentId date status').lean(),
      Attendance.aggregate([{ $match: { enrollmentId: { $in: ids } } }, { $group: { _id: { e: '$enrollmentId', s: '$status' }, n: { $sum: 1 } } }]),
      Recitation.find({ enrollmentId: { $in: ids } }).sort({ date: -1, createdAt: -1 }).limit(400).select('enrollmentId date type mode surah fromAyah toAyah fromPage toPage grade').lean(),
      Note.find({ enrollmentId: { $in: ids }, visibleToStudent: true }).sort({ date: -1, createdAt: -1 }).limit(100).populate('createdBy', 'name').select('enrollmentId date category text createdBy').lean(),
      LevelChange.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(50).populate('fromLevelId', 'name').populate('toLevelId', 'name').lean(),
    ]);

    const attBy = group(attRecent), recBy = group(recs), noteBy = group(notes);
    const counts = {};
    for (const c of attCounts) { const k = String(c._id.e); (counts[k] ||= { present: 0, absent: 0 })[c._id.s] = c.n; }

    const out = enrollments.map((e) => {
      const k = String(e._id);
      const c = counts[k] || { present: 0, absent: 0 };
      const total = c.present + c.absent;
      return {
        id: k,
        status: e.status,
        level: e.levelId ? { name: e.levelId.name } : null,
        teacher: e.teacherId?.name || '',
        position: e.position || '',
        startedAt: e.startedAt || '',
        schedule: { days: e.schedule?.days || [], arrivalTime: e.schedule?.arrivalTime || '', startTime: e.schedule?.startTime || '', endTime: e.schedule?.endTime || '', notes: e.schedule?.notes || '' },
        nextSession: e.status === 'active' ? nextSession(e.schedule?.days, today) : null,
        progress: prog.get(k) || null,
        attendance: { present: c.present, absent: c.absent, total, rate: total ? Math.round((c.present / total) * 100) : null, recent: (attBy.get(k) || []).slice(0, RECENT_ATT).map((r) => ({ date: r.date, status: r.status })) },
        recitations: (recBy.get(k) || []).slice(0, RECENT_REC).map((r) => ({
          date: r.date, type: r.type, mode: r.mode, surah: r.surah, surahName: r.surah ? SURAHS[r.surah - 1]?.name : undefined,
          fromAyah: r.fromAyah, toAyah: r.toAyah, fromPage: r.fromPage, toPage: r.toPage, grade: r.grade || null,
        })),
        notes: (noteBy.get(k) || []).map((n) => ({ date: n.date, category: n.category, text: n.text, by: n.createdBy?.name || '' })),
      };
    });

    res.json({
      student: { name: student.name, age: student.age ?? null, enrolledAt: student.enrolledAt },
      today,
      gradeScale: settings.gradeScale.map((g) => ({ key: g.key, label: g.label, score: g.score })),
      enrollments: out,
      levelChanges: changes.map((c) => ({ at: c.createdAt, type: c.type, from: c.fromLevelId?.name || null, to: c.toLevelId?.name || null })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports._nextSession = nextSession; // للاختبار
