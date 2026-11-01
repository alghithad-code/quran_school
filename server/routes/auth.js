const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { isValidPassword, PASSWORD_MESSAGE } = require('../utils/password');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic(), csrfToken: req.session.csrf });
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

const pwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().max(200).refine(isValidPassword, PASSWORD_MESSAGE),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const parsed = pwSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await user.save();
    await audit(req, 'user.change_password', { targetType: 'user', target: user });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
