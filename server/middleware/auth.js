const crypto = require('crypto');
const User = require('../models/User');
const { Student } = require('../models');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// يتحقق من الجلسة، ويجلب المستخدم من القاعدة في كل طلب (فيسري الإيقاف فوراً)،
// ويفرض رمز CSRF على الطلبات المغيِّرة.
// الافتراضي «رفض الطالب»: كل المسارات الحالية تستخدم requireAuth فيُمنع الطالب منها كلها دون استثناء.
//  - requireAuth:    للموظفين فقط (مدير/مشرف/معلم).
//  - requireAnyAuth: يسمح للطالب أيضاً (بوابة الطالب والمصحف)، ويمنعه ما دامت كلمته مؤقتة.
//  - requireSession: يسمح للطالب حتى مع الكلمة المؤقتة (للدخول/الخروج/تغيير كلمة المرور فقط).
function make({ students = false, pending = false } = {}) {
  return async function auth(req, res, next) {
    try {
      const id = req.session?.userId;
      if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

      const user = await User.findById(id);
      if (!user || user.status !== 'active') {
        return req.session.destroy(() => res.status(401).json({ error: 'انتهت الجلسة أو الحساب موقوف' }));
      }

      if (user.role === 'student') {
        if (!students) return res.status(403).json({ error: 'لا تملك صلاحية لهذه العملية' });
        // حساب الطالب يتوقف تلقائياً بتوقف الطالب أو أرشفته
        const st = user.studentId ? await Student.findById(user.studentId).select('status').lean() : null;
        if (!st || st.status !== 'active') {
          return req.session.destroy(() => res.status(401).json({ error: 'انتهت الجلسة أو الحساب موقوف' }));
        }
        if (user.mustChangePassword && !pending) {
          return res.status(403).json({ error: 'غيّر كلمة المرور المؤقتة أولاً', code: 'must_change_password' });
        }
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
  };
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'لا تملك صلاحية لهذه العملية' });
}

module.exports = { requireAuth: make(), requireAnyAuth: make({ students: true }), requireSession: make({ students: true, pending: true }), requireRole };
