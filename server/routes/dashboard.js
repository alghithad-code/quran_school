const express = require('express');
const { Student, Attendance, Recitation, Level, PromotionRequest, Transfer, Notification } = require('../models');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { isManager } = require('../lib/access');
const { buildStudentQuery } = require('../lib/studentFilters');
const { getSettings, scoreMap } = require('../lib/settings');
const { pct, avg } = require('../lib/stats');
const { todayStr, addDays } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

const count = async (user, q) => Student.countDocuments(await buildStudentQuery(user, q));

router.get('/', async (req, res, next) => {
  try {
    const u = req.user, today = todayStr();
    const latestNotifs = await Notification.find({ userId: u._id }).sort({ createdAt: -1 }).limit(5).lean();
    const notifications = latestNotifs.map((n) => ({ id: n._id, title: n.title, body: n.body, link: n.link, read: n.read, at: n.createdAt }));

    if (!isManager(u)) {
      const [students, present, absent, noEval, todayList, pending] = await Promise.all([
        count(u, {}), count(u, { filter: 'present_today' }), count(u, { filter: 'absent_today' }), count(u, { filter: 'no_eval_today' }),
        Student.find(await buildStudentQuery(u, { today: '1' })).sort({ 'schedule.arrivalTime': 1, name: 1 }).limit(50).select('name schedule').lean(),
        PromotionRequest.countDocuments({ teacherId: u._id, status: 'pending' }),
      ]);
      const att = await Attendance.find({ studentId: { $in: todayList.map((s) => s._id) }, date: today }).select('studentId status').lean();
      const am = Object.fromEntries(att.map((a) => [String(a.studentId), a.status]));
      return res.json({
        role: 'teacher',
        cards: { students, presentToday: present, absentToday: absent, noEvalToday: noEval, pendingPromotions: pending },
        today: todayList.map((s) => ({ id: s._id, name: s.name, arrivalTime: s.schedule?.arrivalTime, startTime: s.schedule?.startTime, endTime: s.schedule?.endTime, status: am[String(s._id)] || null })),
        notifications,
      });
    }

    const settings = await getSettings();
    const scores = scoreMap(settings);
    const monthFrom = addDays(today, -29);
    const [students, teachersActive, teachersSuspended, present, absent, noEval, frequent, pending, perLevelRaw, levels, transfers, recs] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'teacher', status: 'active' }),
      User.countDocuments({ role: 'teacher', status: 'suspended' }),
      count(u, { filter: 'present_today' }), count(u, { filter: 'absent_today' }),
      count(u, { filter: 'no_eval_today' }), count(u, { filter: 'frequent_absent' }),
      PromotionRequest.countDocuments({ status: 'pending' }),
      Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$levelId', n: { $sum: 1 } } }]),
      Level.find().sort({ order: 1 }).select('name').lean(),
      Transfer.find().sort({ createdAt: -1 }).limit(5).populate('studentId', 'name').populate('fromTeacherId toTeacherId', 'name').lean(),
      Recitation.find({ date: { $gte: monthFrom, $lte: today }, grade: { $ne: null } }).select('type grade').lean(),
    ]);
    const lm = Object.fromEntries(perLevelRaw.map((r) => [String(r._id), r.n]));
    const sc = (t) => avg(recs.filter((r) => r.type === t && r.grade in scores).map((r) => scores[r.grade]));
    res.json({
      role: 'manager',
      cards: {
        students, teachersActive, teachersSuspended, presentToday: present, absentToday: absent,
        attendanceRate: pct(present, present + absent), avgHifz: sc('hifz'), avgReview: sc('review'),
        noEvalToday: noEval, frequentAbsent: frequent, pendingPromotions: pending,
      },
      perLevel: [...levels.map((l) => ({ id: l._id, name: l.name, count: lm[String(l._id)] || 0 })), { id: 'none', name: 'بلا مستوى', count: lm.null || 0 }].filter((l) => l.id !== 'none' || l.count),
      transfers: transfers.map((t) => ({ at: t.createdAt, student: t.studentId?.name, studentId: t.studentId?._id, from: t.fromTeacherId?.name, to: t.toTeacherId?.name })),
      notifications,
      avgPeriodDays: 30,
    });
  } catch (err) { next(err); }
});

module.exports = router;
