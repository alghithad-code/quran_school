const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const { Enrollment, Level } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { normalizeSaudiPhone, whatsappLink } = require('../utils/phone');
const { isValidPassword, PASSWORD_MESSAGE } = require('../utils/password');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (id) => mongoose.isValidObjectId(id);

// المشرف يدير المعلمين فقط. مدير النظام يدير الجميع.
function canManage(actor, target) {
  if (actor.role === 'admin') return true;
  return actor.role === 'supervisor' && target.role === 'teacher';
}
function canCreateRole(actor, role) {
  if (actor.role === 'admin') return true;
  return actor.role === 'supervisor' && role === 'teacher';
}

function present(u) {
  const o = u.toPublic();
  o.whatsapp = whatsappLink(u.phone);
  return o;
}

// يضيف للمعلمين: عدد الطلاب النشطين والمستويات المرتبطة
async function decorate(users) {
  const teachers = users.filter((u) => u.role === 'teacher');
  const counts = teachers.length
    ? await Enrollment.aggregate([
      { $match: { teacherId: { $in: teachers.map((t) => t._id) }, status: 'active' } },
      { $group: { _id: '$teacherId', s: { $addToSet: '$studentId' } } },
      { $project: { n: { $size: '$s' } } },
    ])
    : [];
  const cm = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  const lids = [...new Set(teachers.flatMap((t) => t.levelIds.map(String)))];
  const lv = lids.length ? await Level.find({ _id: { $in: lids } }).select('name order').lean() : [];
  const lm = Object.fromEntries(lv.map((l) => [String(l._id), l]));
  return users.map((u) => {
    const o = present(u);
    if (u.role === 'teacher') {
      o.studentCount = cm[String(u._id)] || 0;
      o.levels = u.levelIds.map((id) => lm[String(id)]).filter(Boolean).sort((a, b) => a.order - b.order).map((l) => ({ id: String(l._id), name: l.name }));
    }
    return o;
  });
}

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'اسم المستخدم: 3-40 حرفاً إنجليزياً أو أرقاماً أو . _ -');
const password = z.string().max(200).refine(isValidPassword, PASSWORD_MESSAGE);
const phoneField = z.string().trim().max(30).optional().default('');

const createSchema = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(100),
  username,
  password,
  phone: phoneField,
  role: z.enum(['admin', 'supervisor', 'teacher']).default('teacher'),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  username: username.optional(),
  phone: z.string().trim().max(30).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const filter = {};
    // المشرف لا يرى إلا المعلمين
    if (req.user.role === 'supervisor') filter.role = 'teacher';
    else if (['admin', 'supervisor', 'teacher'].includes(req.query.role)) filter.role = req.query.role;
    if (['active', 'suspended'].includes(req.query.status)) filter.status = req.query.status;
    const q = String(req.query.q || '').trim().slice(0, 50);
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { username: rx }, { phone: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ items: await decorate(items), total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (!canCreateRole(req.user, d.role)) return res.status(403).json({ error: 'لا تملك صلاحية إنشاء هذا النوع من الحسابات' });

    const phone = normalizeSaudiPhone(d.phone);
    if (phone === null) return res.status(400).json({ error: 'رقم الجوال غير صحيح، مثال: 05XXXXXXXX' });

    if (await User.exists({ username: d.username })) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });

    const user = await User.create({
      name: d.name,
      username: d.username,
      phone,
      role: d.role,
      passwordHash: await bcrypt.hash(d.password, 12),
      createdBy: req.user._id,
    });
    await audit(req, 'user.create', { targetType: 'user', target: user, details: { role: user.role } });
    res.status(201).json({ user: present(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    next(err);
  }
});

async function loadTarget(req, res) {
  if (!isId(req.params.id)) {
    res.status(404).json({ error: 'غير موجود' });
    return null;
  }
  const target = await User.findById(req.params.id);
  // نفس الرد لغير الموجود ولغير المصرح به، حتى لا نكشف وجود حسابات
  if (!target || !canManage(req.user, target)) {
    res.status(404).json({ error: 'غير موجود' });
    return null;
  }
  return target;
}

router.get('/:id', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (target) res.json({ user: (await decorate([target]))[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const before = { name: target.name, username: target.username, phone: target.phone };

    if (d.phone !== undefined) {
      const phone = normalizeSaudiPhone(d.phone);
      if (phone === null) return res.status(400).json({ error: 'رقم الجوال غير صحيح، مثال: 05XXXXXXXX' });
      target.phone = phone;
    }
    if (d.username && d.username !== target.username) {
      if (await User.exists({ username: d.username, _id: { $ne: target._id } })) {
        return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
      }
      target.username = d.username;
    }
    if (d.name) target.name = d.name;
    await target.save();
    await audit(req, 'user.update', {
      targetType: 'user',
      target,
      details: { before, after: { name: target.name, username: target.username, phone: target.phone } },
    });
    res.json({ user: present(target) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    next(err);
  }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    const status = req.body?.status;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك' });

    // لا نسمح بإيقاف آخر مدير نظام نشط
    if (status === 'suspended' && target.role === 'admin') {
      const others = await User.countDocuments({ role: 'admin', status: 'active', _id: { $ne: target._id } });
      if (others === 0) return res.status(400).json({ error: 'لا يمكن إيقاف آخر مدير نظام' });
    }
    const old = target.status;
    target.status = status;
    await target.save();
    await audit(req, status === 'suspended' ? 'user.suspend' : 'user.activate', {
      targetType: 'user',
      target,
      details: { before: old, after: status },
    });
    res.json({ user: present(target) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    const parsed = password.safeParse(req.body?.password);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    target.passwordHash = await bcrypt.hash(parsed.data, 12);
    target.failedLogins = 0;
    target.lockUntil = null;
    await target.save();
    await audit(req, 'user.reset_password', { targetType: 'user', target });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
