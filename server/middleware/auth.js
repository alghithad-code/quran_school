const crypto = require('crypto');
const User = require('../models/User');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// يتحقق من الجلسة، ويجلب المستخدم من القاعدة في كل طلب (فيسري الإيقاف فوراً)،
// ويفرض رمز CSRF على الطلبات المغيِّرة.
async function requireAuth(req, res, next) {
  try {
    const id = req.session?.userId;
    if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

    const user = await User.findById(id);
    if (!user || user.status !== 'active') {
      return req.session.destroy(() => res.status(401).json({ error: 'انتهت الجلسة أو الحساب موقوف' }));
    }

    if (!SAFE_METHODS.has(req.method)) {
      if (!safeEqual(req.get('x-csrf-token'), req.session.csrf)) {
        return res.status(403).json({ error: 'رمز الحماية غير صالح، أعد تحميل الصفحة' });
      }
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'لا تملك صلاحية لهذه العملية' });
}

module.exports = { requireAuth, requireRole };
