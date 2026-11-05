const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Group, GroupMessage, Student, Enrollment } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');

// المجموعات للرسائل الجماعية بالواتساب، وللمشرف ومدير النظام فقط (لأن الأرقام خاصة بالطلاب)
const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));
const isId = mongoose.isValidObjectId;
const nameSchema = z.object({ name: z.string().trim().min(2, 'اسم المجموعة مطلوب').max(100) });

const hasPhone = (s) => !!(s.phone && String(s.phone).trim());
const present = (g, extra = {}) => ({ id: String(g._id), name: g.name, studentCount: g.studentIds.length, ...extra });

router.get('/', async (req, res, next) => {
  try {
    const groups = await Group.find().sort({ name: 1 }).lean();
    const all = [...new Set(groups.flatMap((g) => g.studentIds.map(String)))];
    const students = all.length ? await Student.find({ _id: { $in: all } }).select('phone status').lean() : [];
    const ok = new Set(students.filter((s) => s.status === 'active' && hasPhone(s)).map((s) => String(s._id)));
    res.json({ items: groups.map((g) => present(g, { withPhone: g.studentIds.filter((id) => ok.has(String(id))).length })) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const p = nameSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const g = await Group.create({ name: p.data.name, createdBy: req.user._id });
    await audit(req, 'group.create', { targetType: 'group', target: g });
    res.status(201).json({ group: present(g) });
  } catch (e) { next(e); }
});

async function loadGroup(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ error: 'غير موجود' }); return null; }
  const g = await Group.findById(req.params.id);
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
    res.json({
      group: present(g, { withPhone: students.filter((s) => s.status === 'active' && hasPhone(s)).length }),
      members: students.map((s) => {
        const list = by.get(String(s._id)) || [];
        return { id: String(s._id), name: s.name, status: s.status, hasPhone: hasPhone(s), level: uniq(list.map((e) => e.levelId?.name)), teacher: uniq(list.map((e) => e.teacherId?.name)) };
      }),
    });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const p = nameSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const before = g.name;
    g.name = p.data.name;
    await g.save();
    await audit(req, 'group.update', { targetType: 'group', target: g, details: { before, after: g.name } });
    res.json({ group: present(g) });
  } catch (e) { next(e); }
});

// إضافة/إزالة طلاب من المجموعة
router.post('/:id/members', async (req, res, next) => {
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
    const fresh = await Group.findById(g._id).select('studentIds').lean();
    res.json({ studentCount: fresh.studentIds.length });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    await g.deleteOne(); // لا تُحذف أي بيانات طلاب، الانتماء للمجموعة فقط
    await GroupMessage.deleteMany({ groupId: g._id });
    await audit(req, 'group.delete', { targetType: 'group', target: g });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- الرسائل الجماعية ----------
// {الاسم} = اسم الطالب، {المجموعة} = اسم المجموعة. يُبنى رابط واتساب مخصص لكل مستلم.
const personalize = (text, name, group) => text.replace(/\{الاسم\}/g, name).replace(/\{المجموعة\}/g, group);
const waLink = (phone, msg) => `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

function presentMessage(m, groupName) {
  return {
    id: String(m._id), text: m.text, at: m.createdAt,
    total: m.recipients.length, opened: m.recipients.filter((r) => r.status === 'opened').length, noPhone: m.recipients.filter((r) => r.status === 'nophone').length,
    recipients: m.recipients.map((r) => ({
      studentId: String(r.studentId), name: r.name, phone: r.phone, status: r.status, openedAt: r.openedAt,
      link: r.status === 'nophone' ? null : waLink(r.phone, personalize(m.text, r.name, groupName)),
    })),
  };
}

router.post('/:id/messages', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'اكتب نص الرسالة' });
    if (text.length > 600) return res.status(400).json({ error: 'الرسالة أطول من 600 حرف' });
    // الأعضاء النشطون فقط؛ من لا رقم له يُعلَّم «بلا رقم» ويظهر للمتابعة
    const students = await Student.find({ _id: { $in: g.studentIds }, status: 'active' }).sort({ name: 1 }).lean();
    if (!students.length) return res.status(400).json({ error: 'لا يوجد أعضاء نشطون في المجموعة' });
    const m = await GroupMessage.create({
      groupId: g._id, text, createdBy: req.user._id,
      recipients: students.map((s) => ({ studentId: s._id, name: s.name, phone: hasPhone(s) ? s.phone : '', status: hasPhone(s) ? 'pending' : 'nophone' })),
    });
    await audit(req, 'group.message', { targetType: 'group', target: g, details: { messageId: String(m._id), recipients: m.recipients.length, noPhone: m.recipients.filter((r) => r.status === 'nophone').length } });
    res.status(201).json({ message: presentMessage(m, g.name) });
  } catch (e) { next(e); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    const list = await GroupMessage.find({ groupId: g._id }).sort({ createdAt: -1 }).limit(30).populate('createdBy', 'name').lean();
    res.json({ items: list.map((m) => ({ id: String(m._id), text: m.text, at: m.createdAt, by: m.createdBy?.name, total: m.recipients.length, opened: m.recipients.filter((r) => r.status === 'opened').length })) });
  } catch (e) { next(e); }
});

router.get('/:id/messages/:mid', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g || !isId(req.params.mid)) return !g ? undefined : res.status(404).json({ error: 'غير موجود' });
    const m = await GroupMessage.findOne({ _id: req.params.mid, groupId: g._id });
    if (!m) return res.status(404).json({ error: 'غير موجود' });
    res.json({ group: { id: String(g._id), name: g.name }, message: presentMessage(m, g.name) });
  } catch (e) { next(e); }
});

// يُستدعى عند الضغط على زر واتساب للمستلم: تُعلَّم «أُرسل له» لتتابع لاحقاً من بقي
router.post('/:id/messages/:mid/opened', async (req, res, next) => {
  try {
    const g = await loadGroup(req, res);
    if (!g) return;
    if (!isId(req.params.mid) || !isId(req.body?.studentId)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
    await GroupMessage.updateOne(
      { _id: req.params.mid, groupId: g._id, recipients: { $elemMatch: { studentId: req.body.studentId, status: 'pending' } } },
      { $set: { 'recipients.$.status': 'opened', 'recipients.$.openedAt': new Date() } },
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
