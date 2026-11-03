const mongoose = require('mongoose');
const { Student, Enrollment } = require('../models');

// العزل: المعلم لا يرى إلا تسجيلاته (التي هو معلمها الحالي)، ومنها يُشتق الطلاب الذين يراهم.
const enrollmentScope = (user) => (user.role === 'teacher' ? { teacherId: user._id } : {});
const isManager = (u) => u.role === 'admin' || u.role === 'supervisor';

// الطالب مرئي للمعلم إن كان له تسجيل عنده. نفس الرد 404 لغير الموجود وغير المصرح.
async function loadStudent(req, res, id = req.params.id) {
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ error: 'غير موجود' }); return null; }
  const s = await Student.findById(id);
  if (!s || (!isManager(req.user) && !(await Enrollment.exists({ studentId: s._id, teacherId: req.user._id })))) {
    res.status(404).json({ error: 'غير موجود' });
    return null;
  }
  return s;
}

// يحمّل التسجيل (مع الطالب) ضمن نطاق المستخدم
async function loadEnrollment(req, res, id = req.params.eid) {
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ error: 'غير موجود' }); return null; }
  const e = await Enrollment.findOne({ _id: id, ...enrollmentScope(req.user) });
  const student = e && (await Student.findById(e.studentId));
  if (!e || !student) { res.status(404).json({ error: 'غير موجود' }); return null; }
  return { e, student };
}

// المعلم يعدّل ما أنشأه هو فقط. المشرف ومدير النظام يعدّلان الجميع (مع التوثيق).
const canEditRecord = (u, rec) => isManager(u) || String(rec.createdBy) === String(u._id);

module.exports = { enrollmentScope, loadStudent, loadEnrollment, isManager, canEditRecord };
