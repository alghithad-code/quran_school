const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Enrollment, Level, LevelChange, Attendance, Recitation, Note, Transfer, PromotionRequest } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadEnrollment } = require('../lib/access');
const { notify } = require('../lib/notify');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');

// موضع الحفظ وملاحظات هذا المستوى: المعلم يعدّل تسجيلاته، والمشرف الجميع
router.patch('/:eid', async (req, res, next) => {
  try {
    const ctx = await loadEnrollment(req, res);
    if (!ctx) return;
    const { e, student } = ctx;
    const before = { position: e.position, notes: e.notes };
    if (req.body.position !== undefined) e.position = String(req.body.position).trim().slice(0, 200);
    if (req.body.notes !== undefined) e.notes = String(req.body.notes).trim().slice(0, 1000);
    await e.save();
    await audit(req, 'enrollment.update', { targetType: 'student', target: student, details: { enrollmentId: String(e._id), before, after: { position: e.position, notes: e.notes } } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const time = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'صيغة الوقت HH:MM')]);
const scheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  arrivalTime: time, startTime: time, endTime: time,
  notes: z.string().trim().max(300).optional().default(''),
});

router.put('/:eid/schedule', async (req, res, next) => {
  try {
    const ctx = await loadEnrollment(req, res);
    if (!ctx) return;
    const { e, student } = ctx;
    const p = scheduleSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    if (d.startTime && d.endTime && d.startTime >= d.endTime) return res.status(400).json({ error: 'وقت نهاية التسميع يجب أن يكون بعد البداية' });
    const before = e.schedule.toObject();
    e.schedule = { ...d, days: [...new Set(d.days)].sort() };
    await e.save();
    await audit(req, 'student.schedule', { targetType: 'student', target: student, details: { enrollmentId: String(e._id), before, after: e.schedule.toObject() } });
    res.json({ schedule: e.schedule });
  } catch (err) { next(err); }
});

// تغيير مستوى هذا التسجيل مباشرة (ترقية/خفض). الخفض يتطلب سبباً.
router.post('/:eid/level', manager, async (req, res, next) => {
  try {
    const ctx = await loadEnrollment(req, res);
    if (!ctx) return;
    const { e, student } = ctx;
    const { levelId, reason = '' } = req.body || {};
    if (!mongoose.isValidObjectId(levelId)) return res.status(400).json({ error: 'اختر المستوى' });
    const [to, from] = await Promise.all([Level.findById(levelId), e.levelId ? Level.findById(e.levelId) : null]);
    if (!to) return res.status(400).json({ error: 'المستوى غير موجود' });
    if (from && String(from._id) === String(to._id)) return res.status(400).json({ error: 'التسجيل في هذا المستوى بالفعل' });
    if (await Enrollment.exists({ studentId: e.studentId, levelId: to._id, status: 'active', _id: { $ne: e._id } })) return res.status(409).json({ error: 'الطالب مسجّل في هذا المستوى بتسجيل آخر' });
    const type = !from ? 'assign' : to.order < from.order ? 'demotion' : 'promotion';
    const why = String(reason).trim().slice(0, 500);
    if (type === 'demotion' && !why) return res.status(400).json({ error: 'سبب الخفض مطلوب' });
    e.levelId = to._id;
    await e.save();
    await LevelChange.create({ studentId: e.studentId, enrollmentId: e._id, fromLevelId: from?._id || null, toLevelId: to._id, type, reason: why, byId: req.user._id });
    await audit(req, `student.level_${type}`, { targetType: 'student', target: student, details: { from: from?.name, to: to.name, reason: why } });
    if (type === 'demotion') await notify([e.teacherId], { type: 'student.demoted', title: 'خفض مستوى طالب', body: `${student.name}: من ${from.name} إلى ${to.name}. السبب: ${why}`, link: `/students/${student._id}` });
    else if (type === 'promotion') await notify([e.teacherId], { type: 'student.promoted', title: 'ترقية طالب', body: `${student.name}: من ${from.name} إلى ${to.name}`, link: `/students/${student._id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// إنهاء تسجيل في مستوى (تبقى كل سجلاته) أو إعادة تفعيله
router.post('/:eid/status', manager, async (req, res, next) => {
  try {
    const ctx = await loadEnrollment(req, res);
    if (!ctx) return;
    const { e, student } = ctx;
    const status = req.body?.status;
    if (!['active', 'ended'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    if (status === e.status) return res.json({ ok: true });
    if (status === 'active' && (await Enrollment.exists({ studentId: e.studentId, levelId: e.levelId, status: 'active', _id: { $ne: e._id } }))) {
      return res.status(409).json({ error: 'الطالب مسجّل في هذا المستوى بتسجيل آخر نشط' });
    }
    e.status = status;
    await e.save();
    await audit(req, 'student.enrollment_status', { targetType: 'student', target: student, details: { enrollmentId: String(e._id), status } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// حذف تسجيل أُضيف بالخطأ: مسموح فقط إن لم تكن له أي سجلات (حضور/تسميع/ملاحظات). غير ذلك: «إخراج من المستوى».
router.delete('/:eid', manager, async (req, res, next) => {
  try {
    const ctx = await loadEnrollment(req, res);
    if (!ctx) return;
    const { e, student } = ctx;
    const q = { enrollmentId: e._id };
    if ((await Attendance.exists(q)) || (await Recitation.exists(q)) || (await Note.exists(q))) {
      return res.status(400).json({ error: 'لا يمكن الحذف النهائي لأن للتسجيل سجلات (حضور أو تسميع أو ملاحظات). استخدم «إخراج من المستوى» فتبقى سجلاته.' });
    }
    const lvl = e.levelId ? (await Level.findById(e.levelId).select('name').lean())?.name : null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await LevelChange.deleteMany(q, { session });
        await Transfer.deleteMany(q, { session });
        await PromotionRequest.deleteMany(q, { session });
        await Enrollment.deleteOne({ _id: e._id }, { session });
      });
    } finally { await session.endSession(); }
    await audit(req, 'student.enrollment_delete', { targetType: 'student', target: student, details: { enrollmentId: String(e._id), level: lvl } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
