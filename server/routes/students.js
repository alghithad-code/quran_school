const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Student, Enrollment, Attendance, Recitation, Note, Level, Transfer, LevelChange, Group, PromotionRequest } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadStudent, enrollmentScope, isManager } = require('../lib/access');
const { buildStudentFilter } = require('../lib/studentFilters');
const { progressFor } = require('../lib/progress');
const { notify, managerIds } = require('../lib/notify');
const { getSettings } = require('../lib/settings');
const { audit } = require('../utils/audit');
const { normalizePhone, whatsappLink, PHONE_MESSAGE } = require('../utils/phone');
const { todayStr, isDateStr } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');
const age = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().min(3, 'العمر غير صحيح').max(100, 'العمر غير صحيح').optional());

const presentStudent = (s, extra = {}) => ({
  id: String(s._id), name: s.name, age: s.age, phone: s.phone, whatsapp: whatsappLink(s.phone),
  enrolledAt: s.enrolledAt, notes: s.notes, status: s.status, ...extra,
});
function presentEnrollment(e, extra = {}) {
  const t = e.teacherId && e.teacherId.name ? { id: String(e.teacherId._id), name: e.teacherId.name } : { id: String(e.teacherId) };
  const l = e.levelId && e.levelId.name ? { id: String(e.levelId._id), name: e.levelId.name } : null;
  return { id: String(e._id), studentId: String(e.studentId), teacher: t, level: l, position: e.position, notes: e.notes, status: e.status, startedAt: e.startedAt, schedule: e.schedule, ...extra };
}
const popEnr = (q) => q.populate('teacherId', 'name').populate('levelId', 'name');

// ---------- القائمة: بطاقة لكل طالب تضم تسجيلاته (المعلم يرى تسجيلاته فقط) ----------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const { filter, enrollmentFilter } = await buildStudentFilter(req.user, req.query);

    let students, total;
    if (req.query.today === '1') {
      // الترتيب بموعد الحضور: نأخذ التسجيلات مرتبة ثم نشتق ترتيب الطلاب منها
      const ordered = await Enrollment.find(enrollmentFilter).sort({ 'schedule.arrivalTime': 1 }).select('studentId').lean();
      const order = [...new Set(ordered.map((e) => String(e.studentId)))];
      const found = await Student.find(filter).lean();
      const byId = new Map(found.map((s) => [String(s._id), s]));
      const all = order.map((id) => byId.get(id)).filter(Boolean);
      total = all.length;
      students = all.slice((page - 1) * limit, page * limit);
    } else {
      [students, total] = await Promise.all([
        Student.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        Student.countDocuments(filter),
      ]);
    }

    const showEnded = ['all', 'archived'].includes(req.query.status);
    const enrollments = await popEnr(Enrollment.find({ studentId: { $in: students.map((s) => s._id) }, ...enrollmentScope(req.user), ...(showEnded ? {} : { status: 'active' }) }).sort({ createdAt: 1 })).lean();
    const [att, prog] = await Promise.all([
      Attendance.find({ enrollmentId: { $in: enrollments.map((e) => e._id) }, date: todayStr() }).select('enrollmentId status').lean(),
      progressFor(enrollments),
    ]);
    const todayMap = Object.fromEntries(att.map((a) => [String(a.enrollmentId), a.status]));
    const byStudent = new Map();
    enrollments.forEach((e) => {
      const k = String(e.studentId);
      (byStudent.get(k) || byStudent.set(k, []).get(k)).push(presentEnrollment(e, { today: todayMap[String(e._id)] || null, progress: prog.get(String(e._id)) || null }));
    });
    res.json({ items: students.map((s) => presentStudent(s, { enrollments: byStudent.get(String(s._id)) || [] })), total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// ---------- إضافة طالب جديد مع أول تسجيل ----------
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
    // المعلم: مسموح فقط إذا فعّل مدير النظام الميزة، ويُسجَّل الطالب عنده هو دائماً
    if (!byManager && !(await getSettings()).teachersCanAddStudents) return res.status(403).json({ error: 'إضافة الطلاب غير مفعّلة للمعلمين' });
    const p = createSchema.safeParse(byManager ? req.body : { ...req.body, teacherId: String(req.user._id) });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const phone = normalizePhone(d.phone);
    if (phone === null) return res.status(400).json({ error: PHONE_MESSAGE });
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
    const s = await Student.create({ name: d.name, age: d.age, phone, enrolledAt, notes: byManager ? d.notes : '', createdBy: req.user._id });
    const e = await Enrollment.create({ studentId: s._id, teacherId: teacher._id, levelId, position: d.position, startedAt: enrolledAt, notes: byManager ? '' : d.notes, createdBy: req.user._id });
    if (levelId) await LevelChange.create({ studentId: s._id, enrollmentId: e._id, toLevelId: levelId, type: 'assign', byId: req.user._id });
    await audit(req, 'student.create', { targetType: 'student', target: s, details: { teacher: teacher.name, addedByTeacher: !byManager } });
    if (byManager) await notify([teacher._id], { type: 'student.assigned', title: 'طالب جديد', body: `تمت إضافة الطالب ${s.name} إليك`, link: `/students/${s._id}` });
    else await notify(await managerIds(), { type: 'student.added_by_teacher', title: 'طالب أضافه معلم', body: `${teacher.name} أضاف الطالب ${s.name}`, link: `/students/${s._id}` });
    res.status(201).json({ student: presentStudent(s), enrollmentId: String(e._id) });
  } catch (err) { next(err); }
});

// ---------- ملف الطالب: التسجيلات المرئية للمستخدم + المجموعات + السجل ----------
router.get('/:id', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const enrollments = await popEnr(Enrollment.find({ studentId: s._id, ...enrollmentScope(req.user) }).sort({ createdAt: 1 })).lean();
    const ids = enrollments.map((e) => e._id);
    const [prog, groups, transfers, changes] = await Promise.all([
      progressFor(enrollments.filter((e) => e.status === 'active'), { detail: true }),
      isManager(req.user) ? Group.find({ studentIds: s._id }).select('name').lean() : [],
      Transfer.find({ enrollmentId: { $in: ids } }).sort({ createdAt: -1 }).limit(20).populate('fromTeacherId toTeacherId byId', 'name').lean(),
      LevelChange.find({ enrollmentId: { $in: ids } }).sort({ createdAt: -1 }).limit(20).populate('fromLevelId toLevelId', 'name').populate('byId', 'name').lean(),
    ]);
    const lvName = Object.fromEntries(enrollments.map((e) => [String(e._id), e.levelId?.name]));
    const cnt = new Map();
    for (const M of [Attendance, Recitation, Note]) {
      const rows = await M.aggregate([{ $match: { enrollmentId: { $in: ids } } }, { $group: { _id: '$enrollmentId', n: { $sum: 1 } } }]);
      rows.forEach((r) => cnt.set(String(r._id), (cnt.get(String(r._id)) || 0) + r.n));
    }
    // يُسمح بحذف الطالب نهائياً فقط إن لم تكن له أي سجلات في أي تسجيل (للمشرف والمدير)
    const canDelete = isManager(req.user) && !(await Attendance.exists({ studentId: s._id })) && !(await Recitation.exists({ studentId: s._id })) && !(await Note.exists({ studentId: s._id }));
    res.json({
      student: presentStudent(s),
      enrollments: enrollments.map((e) => presentEnrollment(e, { progress: prog.get(String(e._id)) || null, records: cnt.get(String(e._id)) || 0 })),
      canDelete,
      groups: groups.map((g) => ({ id: String(g._id), name: g.name })),
      transfers: transfers.map((t) => ({ at: t.createdAt, level: lvName[String(t.enrollmentId)], from: t.fromTeacherId?.name, to: t.toTeacherId?.name, by: t.byId?.name })),
      levelChanges: changes.map((c) => ({ at: c.createdAt, level: lvName[String(c.enrollmentId)], type: c.type, from: c.fromLevelId?.name, to: c.toLevelId?.name, reason: c.reason, by: c.byId?.name })),
    });
  } catch (err) { next(err); }
});

// بيانات الشخص (للمشرف ومدير النظام). موضع الحفظ والملاحظات الخاصة بكل مستوى تُعدَّل من التسجيل.
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  age,
  phone: z.string().trim().max(30).optional(),
  enrolledAt: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

router.patch('/:id', manager, async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const p = updateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const before = { name: s.name, age: s.age, phone: s.phone, enrolledAt: s.enrolledAt, notes: s.notes };
    if (d.phone !== undefined) {
      const ph = normalizePhone(d.phone);
      if (ph === null) return res.status(400).json({ error: PHONE_MESSAGE });
      s.phone = ph;
    }
    if (d.enrolledAt !== undefined) {
      if (!isDateStr(d.enrolledAt)) return res.status(400).json({ error: 'تاريخ الالتحاق غير صحيح' });
      s.enrolledAt = d.enrolledAt;
    }
    if (d.name !== undefined) s.name = d.name;
    if (req.body.age !== undefined) s.age = d.age;
    if (d.notes !== undefined) s.notes = d.notes;
    await s.save();
    await audit(req, 'student.update', { targetType: 'student', target: s, details: { before, after: { name: s.name, age: s.age, phone: s.phone, enrolledAt: s.enrolledAt, notes: s.notes } } });
    res.json({ student: presentStudent(s) });
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
    res.json({ student: presentStudent(s) });
  } catch (err) { next(err); }
});

// ---------- تسجيل الطالب في مستوى إضافي (للمشرف ومدير النظام) ----------
router.post('/:id/enrollments', manager, async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const { levelId, teacherId } = req.body || {};
    const position = String(req.body?.position || '').trim().slice(0, 200);
    if (!mongoose.isValidObjectId(levelId)) return res.status(400).json({ error: 'اختر المستوى' });
    if (!mongoose.isValidObjectId(teacherId)) return res.status(400).json({ error: 'اختر المعلم' });
    const [level, teacher] = await Promise.all([Level.findById(levelId), User.findOne({ _id: teacherId, role: 'teacher', status: 'active' })]);
    if (!level) return res.status(400).json({ error: 'المستوى غير موجود' });
    if (!teacher) return res.status(400).json({ error: 'المعلم غير موجود أو موقوف' });
    if (await Enrollment.exists({ studentId: s._id, levelId: level._id, status: 'active' })) return res.status(409).json({ error: 'الطالب مسجّل في هذا المستوى بالفعل' });
    const e = await Enrollment.create({ studentId: s._id, teacherId: teacher._id, levelId: level._id, position, startedAt: todayStr(), createdBy: req.user._id });
    await LevelChange.create({ studentId: s._id, enrollmentId: e._id, toLevelId: level._id, type: 'assign', byId: req.user._id });
    await audit(req, 'student.enrollment_add', { targetType: 'student', target: s, details: { level: level.name, teacher: teacher.name } });
    await notify([teacher._id], { type: 'student.assigned', title: 'طالب جديد', body: `سُجّل الطالب ${s.name} عندك في ${level.name}`, link: `/students/${s._id}` });
    res.status(201).json({ enrollmentId: String(e._id) });
  } catch (err) { next(err); }
});

// حذف طالب أُضيف بالخطأ: فقط إن لم تكن له أي سجلات. غير ذلك: الأرشفة.
router.delete('/:id', manager, async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    if ((await Attendance.exists({ studentId: s._id })) || (await Recitation.exists({ studentId: s._id })) || (await Note.exists({ studentId: s._id }))) {
      return res.status(400).json({ error: 'لا يمكن حذف طالب له سجلات (حضور أو تسميع أو ملاحظات). استخدم الأرشفة فتبقى سجلاته.' });
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const q = { studentId: s._id };
        await Enrollment.deleteMany(q, { session });
        await LevelChange.deleteMany(q, { session });
        await Transfer.deleteMany(q, { session });
        await PromotionRequest.deleteMany(q, { session });
        await Group.updateMany({ studentIds: s._id }, { $pull: { studentIds: s._id } }, { session });
        await Student.deleteOne({ _id: s._id }, { session });
      });
    } finally { await session.endSession(); }
    await audit(req, 'student.delete', { targetType: 'student', target: s, details: { name: s.name, phone: s.phone } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
