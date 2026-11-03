const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { Student, Enrollment, Transfer } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));

// نقل تسجيل أو عدة تسجيلات إلى معلم جديد دفعة واحدة داخل Transaction (إما ينجح الكل أو لا شيء).
// النقل خاص بالتسجيل، فبقية مستويات الطالب تبقى عند معلميها.
router.post('/', async (req, res, next) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.enrollmentIds) ? req.body.enrollmentIds : []).map(String))];
    if (!ids.length || ids.length > 500 || !ids.every((i) => mongoose.isValidObjectId(i))) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });
    if (!mongoose.isValidObjectId(req.body?.toTeacherId)) return res.status(400).json({ error: 'اختر المعلم الجديد' });
    const to = await User.findOne({ _id: req.body.toTeacherId, role: 'teacher', status: 'active' });
    if (!to) return res.status(400).json({ error: 'المعلم الجديد غير موجود أو موقوف' });

    const enrs = await Enrollment.find({ _id: { $in: ids }, status: 'active' });
    if (enrs.length !== ids.length) return res.status(400).json({ error: 'بعض التسجيلات غير موجودة أو منتهية' });
    const moving = enrs.filter((e) => String(e.teacherId) !== String(to._id));
    if (!moving.length) return res.status(400).json({ error: 'التسجيلات المحددة عند هذا المعلم بالفعل' });
    const students = await Student.find({ _id: { $in: moving.map((e) => e.studentId) } }).select('name').lean();
    const nm = Object.fromEntries(students.map((s) => [String(s._id), s.name]));

    const batchId = crypto.randomUUID();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Enrollment.updateMany({ _id: { $in: moving.map((e) => e._id) } }, { $set: { teacherId: to._id } }, { session });
        await Transfer.insertMany(moving.map((e) => ({ studentId: e.studentId, enrollmentId: e._id, fromTeacherId: e.teacherId, toTeacherId: to._id, byId: req.user._id, batchId })), { session });
      });
    } finally {
      await session.endSession();
    }

    await audit(req, moving.length > 1 ? 'student.transfer_bulk' : 'student.transfer', {
      targetType: 'student', target: moving.length === 1 ? { _id: moving[0].studentId, name: nm[String(moving[0].studentId)] } : { name: `${moving.length} تسجيلات` },
      details: { to: to.name, batchId, students: moving.map((e) => ({ id: String(e.studentId), enrollmentId: String(e._id), name: nm[String(e.studentId)], from: String(e.teacherId) })) },
    });
    await notify([to._id], moving.length === 1
      ? { type: 'student.transferred_in', title: 'طالب جديد', body: `انتقل إليك الطالب ${nm[String(moving[0].studentId)]}`, link: `/students/${moving[0].studentId}` }
      : { type: 'student.transferred_in', title: 'طلاب جدد', body: `انتقل إليك ${moving.length} طلاب`, link: '/students' });
    const byOld = new Map();
    moving.forEach((e) => { const k = String(e.teacherId); byOld.set(k, [...(byOld.get(k) || []), nm[String(e.studentId)]]); });
    for (const [teacherId, names] of byOld) {
      await notify([teacherId], { type: 'student.transferred_out', title: 'نقل طالب', body: `نُقل من عندك: ${names.slice(0, 3).join('، ')}${names.length > 3 ? ` و${names.length - 3} آخرين` : ''}`, link: '/students' });
    }
    res.json({ moved: moving.length, skipped: enrs.length - moving.length });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const items = await Transfer.find().sort({ createdAt: -1 }).limit(50).populate('studentId', 'name').populate('fromTeacherId toTeacherId byId', 'name').lean();
    res.json({ items: items.map((t) => ({ at: t.createdAt, student: t.studentId?.name, studentId: t.studentId?._id, from: t.fromTeacherId?.name, to: t.toTeacherId?.name, by: t.byId?.name })) });
  } catch (err) { next(err); }
});

module.exports = router;
