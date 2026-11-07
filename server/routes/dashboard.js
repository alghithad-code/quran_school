const express = require('express');
const { Student, Enrollment, Attendance, Recitation, Level, PromotionRequest, Transfer, Notification } = require('../models');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { isManager, enrollmentScope } = require('../lib/access');
const { countStudents } = require('../lib/studentFilters');
const { getSettings, scoreMap } = require('../lib/settings');
const { pct, avg } = require('../lib/stats');
const { todayStr, addDays, weekday } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const u = req.user, today = todayStr();
    const latestNotifs = await Notification.find({ userId: u._id }).sort({ createdAt: -1 }).limit(5).lean();
    const notifications = latestNotifs.map((n) => ({ id: n._id, title: n.title, body: n.body, link: n.link, read: n.read, at: n.createdAt }));

    if (!isManager(u)) {
      const [students, present, absent, noEval, todayEnr, pending] = await Promise.all([
        countStudents(u, {}), countStudents(u, { filter: 'present_today' }), countStudents(u, { filter: 'absent_today' }), countStudents(u, { filter: 'no_eval_today' }),
        Enrollment.find({ ...enrollmentScope(u), status: 'active', 'schedule.days': weekday(today) }).sort({ 'schedule.arrivalTime': 1 }).limit(60).populate('studentId', 'name status').populate('levelId', 'name').lean(),
        PromotionRequest.countDocuments({ teacherId: u._id, status: 'pending' }),
      ]);
      const list = todayEnr.filter((e) => e.studentId?.status === 'active');
      const att = await Attendance.find({ enrollmentId: { $in: list.map((e) => e._id) }, date: today }).select('enrollmentId status').lean();
      const am = Object.fromEntries(att.map((a) => [String(a.enrollmentId), a.status]));
      return res.json({
        role: 'teacher',
        cards: { students, presentToday: present, absentToday: absent, noEvalToday: noEval, pendingPromotions: pending },
        today: list.map((e) => ({ id: e._id, studentId: e.studentId._id, name: e.studentId.name, level: e.levelId?.name || null, arrivalTime: e.schedule?.arrivalTime, startTime: e.schedule?.startTime, endTime: e.schedule?.endTime, status: am[String(e._id)] || null })),
        notifications,
      });
    }

    const settings = await getSettings();
    const scores = scoreMap(settings);
    const monthFrom = addDays(today, -29);
    const [students, teachersActive, teachersSuspended, present, absent, noEval, frequent, pending, perLevelRaw, levels, transfers, recs, noActive] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'teacher', status: 'active' }),
      User.countDocuments({ role: 'teacher', status: 'suspended' }),
      countStudents(u, { filter: 'present_today' }), countStudents(u, { filter: 'absent_today' }),
      countStudents(u, { filter: 'no_eval_today' }), countStudents(u, { filter: 'frequent_absent' }),
      PromotionRequest.countDocuments({ status: 'pending' }),
      Enrollment.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$levelId', n: { $sum: 1 } } }]),
      Level.find().sort({ order: 1 }).select('name').lean(),
      Transfer.find().sort({ createdAt: -1 }).limit(5).populate('studentId', 'name').populate('fromTeacherId toTeacherId', 'name').lean(),
      Recitation.find({ date: { $gte: monthFrom, $lte: today }, grade: { $ne: null } }).select('type grade').lean(),
      countStudents(u, { filter: 'no_active' }),
    ]);
    const lm = Object.fromEntries(perLevelRaw.map((r) => [String(r._id), r.n]));
    const sc = (t) => avg(recs.filter((r) => r.type === t && r.grade in scores).map((r) => scores[r.grade]));
    res.json({
      role: 'manager',
      cards: {
        students, teachersActive, teachersSuspended, presentToday: present, absentToday: absent,
        attendanceRate: pct(present, present + absent), avgHifz: sc('hifz'), avgReview: sc('review'),
        noEvalToday: noEval, frequentAbsent: frequent, pendingPromotions: pending, noActive,
      },
      perLevel: [...levels.map((l) => ({ id: l._id, name: l.name, count: lm[String(l._id)] || 0 })), { id: 'none', name: 'بلا مستوى', count: lm.null || 0 }].filter((l) => l.id !== 'none' || l.count),
      transfers: transfers.map((t) => ({ at: t.createdAt, student: t.studentId?.name, studentId: t.studentId?._id, from: t.fromTeacherId?.name, to: t.toTeacherId?.name })),
      notifications,
      avgPeriodDays: 30,
    });
  } catch (err) { next(err); }
});

module.exports = router;
