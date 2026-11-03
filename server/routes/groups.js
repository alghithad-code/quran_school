const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Group, Student, Enrollment } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isManager } = require('../lib/access');
const { notify } = require('../lib/notify');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');
const isId = mongoose.isValidObjectId;
const idList = (max) => z.array(z.string().refine(isId, 'معرّف غير صحيح')).max(max);

const schema = z.object({
  name: z.string().trim().min(2, 'اسم المجموعة مطلوب').max(100),
  goalType: z.enum(['full_review', 'surah_review', 'tajweed', 'custom'], { errorMap: () => ({ message: 'اختر هدف المجموعة' }) }),
  goalText: z.string().trim().max(300).optional().default(''),
  surahs: z.array(z.number().int().min(1).max(114)).max(114).optional().default([]).transform((a) => [...new Set(a)].sort((x, y) => x - y)),
  teacherIds: idList(20).optional().default([]),
  studentIds: idList(500).optional().default([]),
}).superRefine((d, ctx) => {
  if (d.goalType === 'custom' && !d.goalText) ctx.addIssue({ code: 'custom', message: 'اكتب هدف المجموعة', path: ['goalText'] });
  if (d.goalType === 'surah_review' && !d.surahs.length) ctx.addIssue({ code: 'custom', message: 'حدد السور المطلوب مراجعتها', path: ['surahs'] });
});

const present = (g, extra = {}) => ({
  id: String(g._id), name: g.name, goalType: g.goalType, goalText: g.goalText, surahs: g.goalType === 'surah_review' ? g.surahs : [],
  teachers: (g.teacherIds || []).map((t) => (t.name ? { id: String(t._id), name: t.name, status: t.status } : { id: String(t) })),
  studentCount: g.studentIds.length, ...extra,
});
const populate = (q) => q.populate('teacherIds', 'name status');

async function checkRefs(d) {
  const t = [...new Set(d.teacherIds)];
  if (t.length && (await User.countDocuments({ _id: { $in: t }, role: 'teacher' })) !== t.length) return 'معلم غير موجود';
  const s = [...new Set(d.studentIds)];
  if (s.length && (await Student.countDocuments({ _id: { $in: s } })) !== s.length) return 'طالب غير موجود';
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const f = isManager(req.user) ? {} : { teacherIds: req.user._id }; // المعلم يرى مجموعاته فقط
    const items = await populate(Group.find(f).sort({ name: 1 })).lean();
    res.json({ items: items.map((g) => present(g)) });
  } catch (e) { next(e); }
});

router.post('/', manager, async (req, res, next) => {
  try {
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const bad = await checkRefs(d);
    if (bad) return res.status(400).json({ error: bad });
    const g = await Group.create({ name: d.name, goalType: d.goalType, goalText: d.goalText, surahs: d.goalType === 'surah_review' ? d.surahs : [], teacherIds: [...new Set(d.teacherIds)], studentIds: [...new Set(d.studentIds)], createdBy: req.user._id });
    await audit(req, 'group.create', { targetType: 'group', target: g, details: { goalType: g.goalType, teachers: g.teacherIds.length, students: g.studentIds.length } });
    await notify(g.teacherIds, { type: 'group.assigned', title: 'تعيين في مجموعة', body: `تم تعيينك في المجموعة «${g.name}»`, link: `/groups/${g._id}` });
    res.status(201).json({ group: present(await populate(Group.findById(g._id)).lean()) });
  } catch (e) { next(e); }
});

async function loadGroup(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ error: 'غير موجود' }); return null; }
  const f = { _id: req.params.id, ...(isManager(req.user) ? {} : { teacherIds: req.user._id }) };
  const g = await Group.findOne(f);
  if (!g) { res.status(404).json({ error: 'غير موجود' }); return null; }
  return g;
}

router.get('/:id', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const students = await Student.find({ _id: { $in: g.studentIds } }).sort({ name: 1 }).lean();
    const enrs = await Enrollment.find({ studentId: { $in: g.studentIds }, status: 'active' }).populate('teacherId', 'name').populate('levelId', 'name').lean();
    const by = new Map();
    enrs.forEach((e) => { const k = String(e.studentId); (by.get(k) || by.set(k, []).get(k)).push(e); });
    const uniq = (a) => [...new Set(a.filter(Boolean))].join('، ') || null;
    await g.populate('teacherIds', 'name status');
    res.json({
      group: present(g),
      members: students.map((s) => {
        const list = by.get(String(s._id)) || [];
        return {
          id: String(s._id), name: s.name, status: s.status, level: uniq(list.map((e) => e.levelId?.name)), teacher: uniq(list.map((e) => e.teacherId?.name)),
          canOpen: isManager(req.user) || list.some((e) => String(e.teacherId?._id) === String(req.user._id)), // المعلم يفتح ملف من عنده تسجيل له فقط
        };
      }),
    });
  } catch (e) { next(e); }
});

router.patch('/:id', manager, async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const p = schema.safeParse({ name: g.name, goalType: g.goalType, goalText: g.goalText, surahs: g.surahs, teacherIds: g.teacherIds.map(String), studentIds: [], ...req.body, studentIds: [] });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const bad = await checkRefs(d);
    if (bad) return res.status(400).json({ error: bad });
    const before = { name: g.name, goalType: g.goalType, goalText: g.goalText, surahs: g.surahs, teachers: g.teacherIds.map(String) };
    const oldT = new Set(g.teacherIds.map(String));
    g.name = d.name; g.goalType = d.goalType; g.goalText = d.goalText;
    g.surahs = d.goalType === 'surah_review' ? d.surahs : [];
    g.teacherIds = [...new Set(d.teacherIds)];
    await g.save();
    await audit(req, 'group.update', { targetType: 'group', target: g, details: { before, after: { name: g.name, goalType: g.goalType, goalText: g.goalText, surahs: g.surahs, teachers: g.teacherIds.map(String) } } });
    await notify(g.teacherIds.filter((t) => !oldT.has(String(t))), { type: 'group.assigned', title: 'تعيين في مجموعة', body: `تم تعيينك في المجموعة «${g.name}»`, link: `/groups/${g._id}` });
    res.json({ group: present(await populate(Group.findById(g._id)).lean()) });
  } catch (e) { next(e); }
});

// إضافة/إزالة طلاب من المجموعة
router.post('/:id/members', manager, async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const add = [...new Set((Array.isArray(req.body?.add) ? req.body.add : []).map(String))];
    const remove = [...new Set((Array.isArray(req.body?.remove) ? req.body.remove : []).map(String))];
    if (![...add, ...remove].every(isId) || add.length + remove.length === 0 || add.length > 500) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });
    if (add.length && (await Student.countDocuments({ _id: { $in: add } })) !== add.length) return res.status(400).json({ error: 'طالب غير موجود' });
    if (add.length) await Group.updateOne({ _id: g._id }, { $addToSet: { studentIds: { $each: add } } });
    if (remove.length) await Group.updateOne({ _id: g._id }, { $pull: { studentIds: { $in: remove } } });
    await audit(req, 'group.members', { targetType: 'group', target: g, details: { added: add.length, removed: remove.length } });
    if (add.length) await notify(g.teacherIds, { type: 'group.members', title: 'طلاب جدد في مجموعة', body: `أُضيف ${add.length} طالب إلى «${g.name}»`, link: `/groups/${g._id}` });
    const fresh = await Group.findById(g._id).select('studentIds').lean();
    res.json({ studentCount: fresh.studentIds.length });
  } catch (e) { next(e); }
});

router.delete('/:id', manager, async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    await g.deleteOne(); // لا تُحذف أي بيانات طلاب، الانتماء للمجموعة فقط
    await audit(req, 'group.delete', { targetType: 'group', target: g });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
