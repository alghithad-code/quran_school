// قواعد تعديل بيانات الحساب الشخصي (اسم المستخدم وكلمة المرور)، دوال نقية للاختبار
const { isValidPassword, PASSWORD_MESSAGE } = require('./password');

const USERNAME_MESSAGE = 'اسم المستخدم: 3-40 حرفاً إنجليزياً أو أرقاماً أو . _ -';
// يعيد { value } بعد التنظيف (مسافات وأحرف صغيرة) أو { error }
function normalizeUsername(v) {
  const u = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return /^[a-z0-9._-]{3,40}$/.test(u) ? { value: u } : { error: USERNAME_MESSAGE };
}

// يعيد رسالة الخطأ أو null. confirmPassword اختياري للتوافق مع واجهات قديمة، وإن أُرسل يجب أن يطابق.
function checkPasswordChange(b) {
  const x = b || {};
  if (typeof x.currentPassword !== 'string' || !x.currentPassword) return 'أدخل كلمة المرور الحالية';
  if (!isValidPassword(x.newPassword)) return PASSWORD_MESSAGE;
  if (x.confirmPassword !== undefined && x.confirmPassword !== x.newPassword) return 'تأكيد كلمة المرور لا يطابق الجديدة';
  if (x.newPassword === x.currentPassword) return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';
  return null;
}

module.exports = { normalizeUsername, USERNAME_MESSAGE, checkPasswordChange };
