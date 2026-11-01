const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { Student, Transfer } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));

// نقل طالب أو عدة طلاب إلى معلم جديد دفعة واحدة داخل Transaction (إما ينجح الكل أو لا شيء)
router.post('/', async (req, res, next) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.studentIds) ? req.body.studentIds : []).map(String))];
    if (!ids.length || ids.length > 500 || !ids.every((i) => mongoose.isValidObjectId(i))) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });
    if (!mongoose.isValidObjectId(req.body?.toTeacherId)) return res.status(400).json({ error: 'اختر المعلم الجديد' });
    const to = await User.findOne({ _id: req.body.toTeacherId, role: 'teacher', status: 'active' });
    if (!to) return res.status(400).json({ error: 'المعلم الجديد غير موجود أو موقوف' });

    const students = await Student.find({ _id: { $in: ids } });
    if (students.length !== ids.length) return res.status(400).json({ error: 'بعض الطلاب غير موجودين' });
    const moving = students.filter((s) => String(s.teacherId) !== String(to._id));
    if (!moving.length) return res.status(400).json({ error: 'الطلاب المحددون مرتبطون بهذا المعلم بالفعل' });

    const batchId = crypto.randomUUID();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Student.updateMany({ _id: { $in: moving.map((s) => s._id) } }, { $set: { teacherId: to._id } }, { session });
        await Transfer.insertMany(moving.map((s) => ({ studentId: s._id, fromTeacherId: s.teacherId, toTeacherId: to._id, byId: req.user._id, batchId })), { session });
      });
    } finally {
      await session.endSession();
    }

    await audit(req, moving.length > 1 ? 'student.transfer_bulk' : 'student.transfer', {
      targetType: 'student', target: moving.length === 1 ? moving[0] : { name: `${moving.length} طلاب` },
      details: { to: to.name, batchId, students: moving.map((s) => ({ id: String(s._id), name: s.name, from: String(s.teacherId) })) },
    });
    await notify([to._id], moving.length === 1
      ? { type: 'student.transferred_in', title: 'طالب جديد', body: `انتقل إليك الطالب ${moving[0].name}`, link: `/students/${moving[0]._id}` }
      : { type: 'student.transferred_in', title: 'طلاب جدد', body: `انتقل إليك ${moving.length} طلاب`, link: '/students' });
    const byOld = new Map();
    moving.forEach((s) => { const k = String(s.teacherId); byOld.set(k, [...(byOld.get(k) || []), s.name]); });
    for (const [teacherId, names] of byOld) {
      await notify([teacherId], { type: 'student.transferred_out', title: 'نقل طالب', body: `نُقل من عندك: ${names.slice(0, 3).join('، ')}${names.length > 3 ? ` و${names.length - 3} آخرين` : ''}`, link: '/students' });
    }
    res.json({ moved: moving.length, skipped: students.length - moving.length });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const items = await Transfer.find().sort({ createdAt: -1 }).limit(50).populate('studentId', 'name').populate('fromTeacherId toTeacherId byId', 'name').lean();
    res.json({ items: items.map((t) => ({ at: t.createdAt, student: t.studentId?.name, studentId: t.studentId?._id, from: t.fromTeacherId?.name, to: t.toTeacherId?.name, by: t.byId?.name })) });
  } catch (err) { next(err); }
});

module.exports = router;
