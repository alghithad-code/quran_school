const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadStudent } = require('../lib/access');
const { audit } = require('../utils/audit');

// حساب الطالب (اسم مستخدم وكلمة مرور). يُنشئه ويديره: المدير والمشرف، والمعلم لطلابه فقط (loadStudent يفرض العزل).
// كلمة المرور المؤقتة تُعرض مرة واحدة للمنشئ، ويُلزَم الطالب بتغييرها عند أول دخول.
const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'اسم المستخدم: 3-40 حرفاً إنجليزياً أو أرقاماً أو . _ -');

const pick = (s) => s[crypto.randomInt(s.length)];
function tempPassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz', upper = 'ACDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789'; // بلا أحرف متشابهة (l/1/O/0)
  const chars = [pick(lower), pick(lower), pick(lower), pick(upper), pick(upper), pick(digits), pick(digits), pick(digits)];
  for (let i = chars.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
async function genUsername() {
  for (let i = 0; i < 10; i += 1) {
    const u = 'st' + crypto.randomInt(100000, 1000000);
    if (!(await User.exists({ username: u }))) return u;
  }
  throw new Error('تعذّر توليد اسم مستخدم، حاول مرة أخرى');
}

const present = (u) => ({ id: String(u._id), username: u.username, status: u.status, mustChangePassword: !!u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
const findAccount = (student) => User.findOne({ studentId: student._id, role: 'student' });

router.get('/', async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const acct = await findAccount(student);
    res.json({ account: acct ? present(acct) : null });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    if (student.status !== 'active') return res.status(400).json({ error: 'لا يمكن إنشاء حساب لطالب غير نشط' });
    if (await findAccount(student)) return res.status(409).json({ error: 'للطالب حساب بالفعل' });

    let username;
    if (req.body?.username) {
      const p = usernameSchema.safeParse(req.body.username);
      if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
      username = p.data;
      if (await User.exists({ username })) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    } else username = await genUsername();

    const password = tempPassword();
    const acct = await User.create({
      name: student.name, username, role: 'student', studentId: student._id,
      passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, createdBy: req.user._id,
    });
    await audit(req, 'studentAccount.create', { targetType: 'student', target: student, details: { username } });
    res.status(201).json({ account: present(acct), password }); // تظهر مرة واحدة فقط
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً أو للطالب حساب بالفعل' });
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const acct = await findAccount(student);
    if (!acct) return res.status(404).json({ error: 'لا يوجد حساب لهذا الطالب' });
    const password = tempPassword();
    acct.passwordHash = await bcrypt.hash(password, 12);
    acct.mustChangePassword = true; // الجلسات المفتوحة تُمنع حتى يغيّر الكلمة
    acct.failedLogins = 0;
    acct.lockUntil = null;
    await acct.save();
    await audit(req, 'studentAccount.reset_password', { targetType: 'student', target: student, details: { username: acct.username } });
    res.json({ account: present(acct), password });
  } catch (err) { next(err); }
});

router.post('/status', async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const acct = await findAccount(student);
    if (!acct) return res.status(404).json({ error: 'لا يوجد حساب لهذا الطالب' });
    const status = req.body?.status;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    const before = acct.status;
    acct.status = status;
    await acct.save();
    await audit(req, 'studentAccount.status', { targetType: 'student', target: student, details: { username: acct.username, before, after: status } });
    res.json({ account: present(acct) });
  } catch (err) { next(err); }
});

router.patch('/', async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const acct = await findAccount(student);
    if (!acct) return res.status(404).json({ error: 'لا يوجد حساب لهذا الطالب' });
    const p = usernameSchema.safeParse(req.body?.username);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    if (p.data !== acct.username && (await User.exists({ username: p.data, _id: { $ne: acct._id } }))) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    const before = acct.username;
    acct.username = p.data;
    await acct.save();
    await audit(req, 'studentAccount.update', { targetType: 'student', target: student, details: { before, after: acct.username } });
    res.json({ account: present(acct) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    next(err);
  }
});

// حذف الحساب نهائياً: للمشرف والمدير فقط (سجلات الطالب نفسها لا تتأثر)
router.delete('/', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const acct = await findAccount(student);
    if (!acct) return res.status(404).json({ error: 'لا يوجد حساب لهذا الطالب' });
    await acct.deleteOne();
    await audit(req, 'studentAccount.delete', { targetType: 'student', target: student, details: { username: acct.username } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports._tempPassword = tempPassword; // للاختبار
