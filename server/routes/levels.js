const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Level, Student } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isManager } = require('../lib/access');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');
const isId = mongoose.isValidObjectId;

router.get('/', async (req, res, next) => {
  try {
    const levels = await Level.find().sort({ order: 1, createdAt: 1 }).lean();
    if (!isManager(req.user)) return res.json({ items: levels.map((l) => ({ id: l._id, name: l.name, order: l.order })) });
    const [counts, teachers] = await Promise.all([
      Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$levelId', n: { $sum: 1 } } }]),
      User.find({ role: 'teacher', levelIds: { $exists: true, $ne: [] } }).select('name levelIds status').lean(),
    ]);
    const cm = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json({
      items: levels.map((l) => ({
        id: l._id, name: l.name, description: l.description, scope: l.scope, order: l.order,
        studentCount: cm[String(l._id)] || 0,
        teachers: teachers.filter((t) => t.levelIds.some((x) => String(x) === String(l._id))).map((t) => ({ id: t._id, name: t.name, status: t.status })),
      })),
      unassigned: cm.null || cm.undefined || 0,
    });
  } catch (err) { next(err); }
});

const body = z.object({
  name: z.string().trim().min(2, 'اسم المستوى مطلوب').max(100),
  description: z.string().trim().max(500).optional().default(''),
  scope: z.string().trim().max(300).optional().default(''),
});

router.post('/', manager, async (req, res, next) => {
  try {
    const p = body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const last = await Level.findOne().sort({ order: -1 }).select('order').lean();
    const level = await Level.create({ ...p.data, order: (last?.order ?? 0) + 1 });
    await audit(req, 'level.create', { targetType: 'level', target: level });
    res.status(201).json({ level });
  } catch (err) { next(err); }
});

// ترتيب المستويات: ids بالترتيب الجديد
router.post('/reorder', manager, async (req, res, next) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.every(isId)) return res.status(400).json({ error: 'ترتيب غير صحيح' });
    const total = await Level.countDocuments();
    if (new Set(ids.map(String)).size !== total) return res.status(400).json({ error: 'يجب إرسال كل المستويات' });
    await Level.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i + 1 } } } })));
    await audit(req, 'level.reorder', { targetType: 'level', details: { ids } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ربط معلم بمستوى أو أكثر (أو نقله من مستوى إلى آخر بتغيير القائمة)
router.put('/teacher/:teacherId', manager, async (req, res, next) => {
  try {
    const ids = req.body?.levelIds;
    if (!isId(req.params.teacherId) || !Array.isArray(ids) || !ids.every(isId)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
    const teacher = await User.findOne({ _id: req.params.teacherId, role: 'teacher' });
    if (!teacher) return res.status(404).json({ error: 'غير موجود' });
    if ((await Level.countDocuments({ _id: { $in: ids } })) !== new Set(ids.map(String)).size) return res.status(400).json({ error: 'مستوى غير موجود' });
    const before = teacher.levelIds.map(String);
    teacher.levelIds = [...new Set(ids.map(String))];
    await teacher.save();
    await audit(req, 'level.assign_teacher', { targetType: 'user', target: teacher, details: { before, after: teacher.levelIds.map(String) } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch('/:id', manager, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ error: 'غير موجود' });
    const p = body.safeParse({ name: level.name, description: level.description, scope: level.scope, ...req.body });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const before = { name: level.name, description: level.description, scope: level.scope };
    Object.assign(level, p.data);
    await level.save();
    await audit(req, 'level.update', { targetType: 'level', target: level, details: { before, after: p.data } });
    res.json({ level });
  } catch (err) { next(err); }
});

router.delete('/:id', manager, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ error: 'غير موجود' });
    if ((await Student.exists({ levelId: level._id })) || (await User.exists({ levelIds: level._id }))) {
      return res.status(400).json({ error: 'لا يمكن حذف مستوى مرتبط بطلاب أو معلمين. انقلهم أولاً.' });
    }
    await level.deleteOne();
    await audit(req, 'level.delete', { targetType: 'level', target: level });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
