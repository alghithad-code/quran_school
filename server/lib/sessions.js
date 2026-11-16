const mongoose = require('mongoose');

// ينهي جلسات حساب معيّن المحفوظة في MongoDB (connect-mongo يخزّن الجلسة نصاً JSON يحوي userId).
// يُستدعى بعد تغيير كلمة المرور أو إعادة تعيينها حتى لا تبقى أجهزة قديمة مسجّلة الدخول. exceptSid: الجلسة الحالية.
async function revokeSessions(userId, exceptSid = null) {
  try {
    const q = { session: { $regex: `\"userId\":\"${String(userId)}\"` } };
    if (exceptSid) q._id = { $ne: exceptSid };
    await mongoose.connection.db.collection('sessions').deleteMany(q);
  } catch (err) {
    console.error('revoke sessions failed:', err.message); // لا يُفشل العملية الأصلية
  }
}

module.exports = { revokeSessions };
