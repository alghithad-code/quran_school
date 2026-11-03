const mongoose = require('mongoose');

// ترحيل لمرة واحدة (آمن للتكرار): الطالب القديم كان يحمل المعلم والمستوى والجدول،
// فيُنشأ له «تسجيل» بها وتُنسب إليه كل سجلاته. لا يفعل شيئاً إن لم توجد بيانات قديمة.
async function migrate() {
  const db = mongoose.connection.db;
  const students = db.collection('students');
  const enrollments = db.collection('enrollments');
  const legacy = await students.find({ teacherId: { $exists: true } }).toArray();
  if (!legacy.length) return;
  console.log(`ترحيل ${legacy.length} طالب إلى نموذج التسجيل…`);
  for (const s of legacy) {
    let e = await enrollments.findOne({ studentId: s._id });
    if (!e) {
      e = {
        _id: new mongoose.Types.ObjectId(), studentId: s._id, teacherId: s.teacherId, levelId: s.levelId || null,
        position: s.position || '', notes: '', status: 'active', startedAt: s.enrolledAt,
        schedule: s.schedule || { days: [], arrivalTime: '', startTime: '', endTime: '', notes: '' },
        createdBy: s.createdBy || null, createdAt: s.createdAt || new Date(), updatedAt: new Date(),
      };
      await enrollments.insertOne(e);
    }
    for (const c of ['attendances', 'recitations', 'notes', 'transfers', 'levelchanges', 'promotionrequests']) {
      await db.collection(c).updateMany({ studentId: s._id, enrollmentId: { $exists: false } }, { $set: { enrollmentId: e._id } });
    }
    await students.updateOne({ _id: s._id }, { $unset: { teacherId: '', levelId: '', position: '', schedule: '' } });
  }
  console.log('اكتمل الترحيل');
}

// الفهرس القديم (طالب + تاريخ) يمنع تسجيل حضور مستقل لكل مستوى، فيُحذف إن وُجد
async function dropLegacyIndexes() {
  try { await mongoose.connection.db.collection('attendances').dropIndex('studentId_1_date_1'); console.log('حُذف فهرس الحضور القديم'); } catch { /* غير موجود */ }
}

module.exports = { migrate, dropLegacyIndexes };
