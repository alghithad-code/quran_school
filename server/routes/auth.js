const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const config = require('../config');
const { Student } = require('../models');
const { requireSession, requireAnyAuth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { revokeSessions } = require('../lib/sessions');
const { normalizeUsername, checkPasswordChange } = require('../utils/account');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30, // محاولات فاشلة فقط لكل IP؛ الدخول الناجح لا يُحتسب فلا يتأثر من يشتركون في شبكة واحدة (مسجد/مدرسة)
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول لاحقاً' },
});

// للمقارنة الوهمية حتى لا يظهر الفرق الزمني بين مستخدم موجود وغير موجود
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
const GENERIC_FAIL = { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };

const loginSchema = z.object({ username: z.string().min(1).max(40), password: z.string().min(1).max(200) });

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(GENERIC_FAIL);
    const username = parsed.data.username.trim().toLowerCase();

    const user = await User.findOne({ username }).select('+passwordHash');
    if (user?.lockUntil && user.lockUntil > new Date()) {
      return res.status(429).json({ error: 'الحساب مقفل مؤقتاً بسبب محاولات خاطئة، حاول بعد قليل' });
    }

    const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        user.failedLogins += 1;
        if (user.failedLogins >= config.lock.maxFailures) {
          user.lockUntil = new Date(Date.now() + config.lock.lockMs);
          user.failedLogins = 0;
        }
        await user.save();
      }
      return res.status(401).json(GENERIC_FAIL);
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'هذا الحساب موقوف، راجع المشرف' });
    if (user.role === 'student') { // حساب الطالب لا يعمل إن كان الطالب موقوفاً أو مؤرشفاً
      const st = user.studentId ? await Student.findById(user.studentId).select('status').lean() : null;
      if (!st || st.status !== 'active') return res.status(403).json({ error: 'هذا الحساب موقوف، راجع المعلم أو المشرف' });
    }

    user.failedLogins = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // تجديد معرف الجلسة بعد الدخول لمنع session fixation
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = String(user._id);
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save((err2) => {
        if (err2) return next(err2);
        res.json({ user: user.toPublic(), csrfToken: req.session.csrf });
      });
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireSession, (req, res) => {
  res.json({ user: req.user.toPublic(), csrfToken: req.session.csrf });
});

router.post('/logout', requireSession, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

// محاولات كلمة المرور الحالية الخاطئة عند تعديل الحساب (لكل حساب)، حمايةً من جلسة مسروقة
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  message: { error: 'محاولات كثيرة، حاول لاحقاً' },
});

router.post('/change-password', requireSession, accountLimiter, async (req, res, next) => {
  try {
    const bad = checkPasswordChange(req.body);
    if (bad) return res.status(400).json({ error: bad });
    const user = await User.findById(req.user._id).select('+passwordHash'); // الحساب صاحب الجلسة فقط
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    await revokeSessions(user._id, req.sessionID); // تُنهى بقية جلسات الحساب، وتبقى الحالية
    await audit(req, 'user.change_password', { targetType: 'user', target: user });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// تغيير اسم المستخدم الخاص بالحساب. لا يمس الدور ولا الصلاحيات، والجلسة الحالية تبقى سارية.
router.post('/change-username', requireAnyAuth, accountLimiter, async (req, res, next) => {
  try {
    const p = normalizeUsername(req.body?.username);
    if (p.error) return res.status(400).json({ error: p.error });
    if (typeof req.body?.currentPassword !== 'string' || !req.body.currentPassword) return res.status(400).json({ error: 'أدخل كلمة المرور الحالية' });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    const before = user.username;
    if (p.value === before) return res.status(400).json({ error: 'اسم المستخدم الجديد مطابق للحالي' });
    if (await User.exists({ username: p.value, _id: { $ne: user._id } })) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    user.username = p.value;
    try { await user.save(); } catch (er) {
      if (er.code === 11000) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
      throw er;
    }
    await audit(req, 'user.change_username', { targetType: 'user', target: user, details: { before, after: user.username } });
    res.json({ ok: true, user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
