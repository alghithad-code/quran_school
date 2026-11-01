const mongoose = require('mongoose');
const { Student } = require('../models');

// العزل: المعلم لا يرى إلا طلابه الحاليين. هذا الفلتر يُطبَّق في كل استعلام عن الطلاب.
const studentScope = (user) => (user.role === 'teacher' ? { teacherId: user._id } : {});

async function loadStudent(req, res, id = req.params.id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: 'غير موجود' });
    return null;
  }
  const s = await Student.findOne({ _id: id, ...studentScope(req.user) });
  if (!s) {
    res.status(404).json({ error: 'غير موجود' }); // نفس الرد لغير الموجود وغير المصرح
    return null;
  }
  return s;
}
const isManager = (u) => u.role === 'admin' || u.role === 'supervisor';
// المعلم يعدّل ما أنشأه هو فقط. المشرف ومدير النظام يعدّلان الجميع (مع التوثيق).
const canEditRecord = (u, rec) => isManager(u) || String(rec.createdBy) === String(u._id);

module.exports = { studentScope, loadStudent, isManager, canEditRecord };
