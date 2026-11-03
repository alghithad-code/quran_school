const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Student, Attendance, Level, Transfer, LevelChange, Group } = require('../models');
const { progressFor } = require('../lib/progress');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadStudent, isManager } = require('../lib/access');
const { buildStudentQuery } = require('../lib/studentFilters');
const { notify, managerIds } = require('../lib/notify');
const { getSettings } = require('../lib/settings');
const { audit } = require('../utils/audit');
const { normalizeSaudiPhone, whatsappLink } = require('../utils/phone');
const { todayStr, isDateStr } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');

const time = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'صيغة الوقت HH:MM')]);
const age = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().min(3, 'العمر غير صحيح').max(100, 'العمر غير صحيح').optional());

function present(s, extra = {}) {
  const t = s.teacherId && s.teacherId.name ? { id: String(s.teacherId._id), name: s.teacherId.name } : { id: String(s.teacherId) };
  const l = s.levelId && s.levelId.name ? { id: String(s.levelId._id), name: s.levelId.name } : null;
  return {
    id: String(s._id), name: s.name, age: s.age, phone: s.phone, whatsapp: whatsappLink(s.phone),
    enrolledAt: s.enrolledAt, teacher: t, level: l, position: s.position, notes: s.notes,
    status: s.status, schedule: s.schedule, ...extra,
  };
}
const populate = (q) => q.populate('teacherId', 'name').populate('levelId', 'name');

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const filter = await buildStudentQuery(req.user, req.query);
    const sort = req.query.today === '1' ? { 'schedule.arrivalTime': 1, name: 1 } : { name: 1 };
    const [items, total] = await Promise.all([
      populate(Student.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)),
      Student.countDocuments(filter),
    ]);
    const att = await Attendance.find({ studentId: { $in: items.map((s) => s._id) }, date: todayStr() }).select('studentId status').lean();
    const todayMap = Object.fromEntries(att.map((a) => [String(a.studentId), a.status]));
    const prog = await progressFor(items);
    res.json({ items: items.map((s) => present(s, { today: todayMap[String(s._id)] || null, progress: prog.get(String(s._id)) || null })), total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'اسم الطالب مطلوب').max(100),
  age,
  phone: z.string().trim().max(30).optional().default(''),
  enrolledAt: z.string().optional(),
  teacherId: z.string().refine(mongoose.isValidObjectId, 'اختر المعلم'),
  levelId: z.string().refine(mongoose.isValidObjectId).optional().or(z.literal('')),
  position: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
});

router.post('/', async (req, res, next) => {
  try {
    const byManager = isManager(req.user);
    // المعلم: مسموح فقط إذا فعّل مدير النظام الميزة، ويُضاف الطالب إليه هو دائماً
    if (!byManager && !(await getSettings()).teachersCanAddStudents) return res.status(403).json({ error: 'إضافة الطلاب غير مفعّلة للمعلمين' });
    const p = createSchema.safeParse(byManager ? req.body : { ...req.body, teacherId: String(req.user._id) });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const phone = normalizeSaudiPhone(d.phone);
    if (phone === null) return res.status(400).json({ error: 'رقم الهاتف غير صحيح، مثال: 05XXXXXXXX' });
    const enrolledAt = d.enrolledAt || todayStr();
    if (!isDateStr(enrolledAt)) return res.status(400).json({ error: 'تاريخ الالتحاق غير صحيح' });
    const teacher = await User.findOne({ _id: d.teacherId, role: 'teacher', status: 'active' });
    if (!teacher) return res.status(400).json({ error: 'المعلم غير موجود أو موقوف' });
    let levelId = null;
    if (d.levelId) {
      if (!byManager && !(req.user.levelIds || []).map(String).includes(d.levelId)) return res.status(400).json({ error: 'اختر مستوى من مستوياتك' });
      if (!(await Level.exists({ _id: d.levelId }))) return res.status(400).json({ error: 'المستوى غير موجود' });
      levelId = d.levelId;
    }
    const s = await Student.create({ name: d.name, age: d.age, phone, enrolledAt, teacherId: teacher._id, levelId, position: d.position, notes: d.notes, createdBy: req.user._id });
    if (levelId) await LevelChange.create({ studentId: s._id, toLevelId: levelId, type: 'assign', byId: req.user._id });
    await audit(req, 'student.create', { targetType: 'student', target: s, details: { teacher: teacher.name, addedByTeacher: !byManager } });
    if (byManager) await notify([teacher._id], { type: 'student.assigned', title: 'طالب جديد', body: `تمت إضافة الطالب ${s.name} إليك`, link: `/students/${s._id}` });
    else await notify(await managerIds(), { type: 'student.added_by_teacher', title: 'طالب أضافه معلم', body: `${teacher.name} أضاف الطالب ${s.name}`, link: `/students/${s._id}` });
    res.status(201).json({ student: present(await populate(Student.findById(s._id))) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    await s.populate([{ path: 'teacherId', select: 'name' }, { path: 'levelId', select: 'name' }]);
    const [prog, groups] = await Promise.all([progressFor([s], { detail: true }), Group.find({ studentIds: s._id }).select('name goalType goalText').lean()]);
    const [transfers, changes] = await Promise.all([
      Transfer.find({ studentId: s._id }).sort({ createdAt: -1 }).limit(20).populate('fromTeacherId toTeacherId byId', 'name').lean(),
      LevelChange.find({ studentId: s._id }).sort({ createdAt: -1 }).limit(20).populate('fromLevelId toLevelId', 'name').populate('byId', 'name').lean(),
    ]);
    res.json({
      student: present(s, { progress: prog.get(String(s._id)) || null }),
      groups: groups.map((g) => ({ id: String(g._id), name: g.name, goalType: g.goalType, goalText: g.goalText })),
      transfers: transfers.map((t) => ({ at: t.createdAt, from: t.fromTeacherId?.name, to: t.toTeacherId?.name, by: t.byId?.name })),
      levelChanges: changes.map((c) => ({ at: c.createdAt, type: c.type, from: c.fromLevelId?.name, to: c.toLevelId?.name, reason: c.reason, by: c.byId?.name })),
    });
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  age,
  phone: z.string().trim().max(30).optional(),
  enrolledAt: z.string().optional(),
  position: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const p = updateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    // المعلم يعدّل موضع الحفظ والملاحظات فقط
    if (!isManager(req.user) && Object.keys(d).some((k) => !['position', 'notes'].includes(k) && d[k] !== undefined)) {
      return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذه البيانات' });
    }
    const before = { name: s.name, age: s.age, phone: s.phone, enrolledAt: s.enrolledAt, position: s.position, notes: s.notes };
    if (d.phone !== undefined) {
      const ph = normalizeSaudiPhone(d.phone);
      if (ph === null) return res.status(400).json({ error: 'رقم الهاتف غير صحيح، مثال: 05XXXXXXXX' });
      s.phone = ph;
    }
    if (d.enrolledAt !== undefined) {
      if (!isDateStr(d.enrolledAt)) return res.status(400).json({ error: 'تاريخ الالتحاق غير صحيح' });
      s.enrolledAt = d.enrolledAt;
    }
    if (d.name !== undefined) s.name = d.name;
    if (req.body.age !== undefined) s.age = d.age;
    if (d.position !== undefined) s.position = d.position;
    if (d.notes !== undefined) s.notes = d.notes;
    await s.save();
    await audit(req, 'student.update', { targetType: 'student', target: s, details: { before, after: { name: s.name, age: s.age, phone: s.phone, enrolledAt: s.enrolledAt, position: s.position, notes: s.notes } } });
    res.json({ student: present(await populate(Student.findById(s._id))) });
  } catch (err) { next(err); }
});

router.post('/:id/status', manager, async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const status = req.body?.status;
    if (!['active', 'paused', 'archived'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    const old = s.status;
    s.status = status; // لا تُحذف السجلات التاريخية أبداً
    await s.save();
    await audit(req, 'student.status', { targetType: 'student', target: s, details: { before: old, after: status } });
    res.json({ student: present(await populate(Student.findById(s._id))) });
  } catch (err) { next(err); }
});

const scheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  arrivalTime: time, startTime: time, endTime: time,
  notes: z.string().trim().max(300).optional().default(''),
});

router.put('/:id/schedule', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const p = scheduleSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    if (d.startTime && d.endTime && d.startTime >= d.endTime) return res.status(400).json({ error: 'وقت نهاية التسميع يجب أن يكون بعد البداية' });
    const before = s.schedule.toObject();
    s.schedule = { ...d, days: [...new Set(d.days)].sort() };
    await s.save();
    await audit(req, 'student.schedule', { targetType: 'student', target: s, details: { before, after: s.schedule.toObject() } });
    res.json({ schedule: s.schedule });
  } catch (err) { next(err); }
});

// تغيير المستوى مباشرة (ترقية/خفض/تعيين) للمشرف ومدير النظام. الخفض يتطلب سبباً.
router.post('/:id/level', manager, async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const { levelId, reason = '' } = req.body || {};
    if (!mongoose.isValidObjectId(levelId)) return res.status(400).json({ error: 'اختر المستوى' });
    const [to, from] = await Promise.all([Level.findById(levelId), s.levelId ? Level.findById(s.levelId) : null]);
    if (!to) return res.status(400).json({ error: 'المستوى غير موجود' });
    if (from && String(from._id) === String(to._id)) return res.status(400).json({ error: 'الطالب في هذا المستوى بالفعل' });
    const type = !from ? 'assign' : to.order < from.order ? 'demotion' : 'promotion';
    const why = String(reason).trim().slice(0, 500);
    if (type === 'demotion' && !why) return res.status(400).json({ error: 'سبب الخفض مطلوب' });
    s.levelId = to._id;
    await s.save();
    await LevelChange.create({ studentId: s._id, fromLevelId: from?._id || null, toLevelId: to._id, type, reason: why, byId: req.user._id });
    await audit(req, `student.level_${type}`, { targetType: 'student', target: s, details: { from: from?.name, to: to.name, reason: why } });
    if (type === 'demotion') await notify([s.teacherId], { type: 'student.demoted', title: 'خفض مستوى طالب', body: `${s.name}: من ${from.name} إلى ${to.name}. السبب: ${why}`, link: `/students/${s._id}` });
    else if (type === 'promotion') await notify([s.teacherId], { type: 'student.promoted', title: 'ترقية طالب', body: `${s.name}: من ${from.name} إلى ${to.name}`, link: `/students/${s._id}` });
    res.json({ student: present(await populate(Student.findById(s._id))) });
  } catch (err) { next(err); }
});

module.exports = router;
