const mongoose = require('mongoose');
const { Student, Enrollment, Attendance, Recitation } = require('../models');
const { enrollmentScope } = require('./access');
const { getSettings } = require('./settings');
const { todayStr, addDays, weekday } = require('../utils/dates');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// فلتر التسجيلات من معاملات الاستعلام. الحضور والتقييم يُحسبان لكل تسجيل على حدة.
async function buildEnrollmentFilter(user, q = {}) {
  const and = [enrollmentScope(user)];
  const today = todayStr();
  // التسجيلات المنتهية لا تظهر إلا عند طلب «الكل» أو «المؤرشفين»
  if (!['all', 'archived'].includes(q.status)) and.push({ status: 'active' });
  if (user.role !== 'teacher' && mongoose.isValidObjectId(q.teacherId)) and.push({ teacherId: q.teacherId });
  if (q.levelId === 'none') and.push({ levelId: null });
  else if (mongoose.isValidObjectId(q.levelId)) and.push({ levelId: q.levelId });
  if (q.today === '1') and.push({ 'schedule.days': weekday(today) });

  switch (q.filter) {
    case 'present_today':
    case 'absent_today': {
      const ids = await Attendance.distinct('enrollmentId', { date: today, status: q.filter === 'present_today' ? 'present' : 'absent' });
      and.push({ _id: { $in: ids } });
      break;
    }
    case 'no_eval_today': {
      // تسجيلات موعدها اليوم أو سُجّل لها حضور اليوم، ولم يُسجَّل لها تقييم اليوم
      const [attended, graded] = await Promise.all([
        Attendance.distinct('enrollmentId', { date: today }),
        Recitation.distinct('enrollmentId', { date: today, grade: { $ne: null } }),
      ]);
      and.push({ status: 'active' }, { $or: [{ 'schedule.days': weekday(today) }, { _id: { $in: attended } }] }, { _id: { $nin: graded } });
      break;
    }
    case 'frequent_absent': {
      const { absenceThreshold } = await getSettings();
      const rows = await Attendance.aggregate([
        { $match: { status: 'absent', date: { $gte: addDays(today, -13), $lte: today } } },
        { $group: { _id: '$enrollmentId', n: { $sum: 1 } } },
        { $match: { n: { $gte: absenceThreshold } } },
      ]);
      and.push({ _id: { $in: rows.map((r) => r._id) } });
      break;
    }
    default:
  }
  return { $and: and };
}

// فلتر الطلاب (الأشخاص) الذين لهم تسجيلات مطابقة. المعلم لا يحصل إلا على طلاب تسجيلاته.
async function buildStudentFilter(user, q = {}) {
  const ef = await buildEnrollmentFilter(user, q);
  const ids = await Enrollment.distinct('studentId', ef);
  const and = [{ _id: { $in: ids } }];
  if (q.status !== 'all') and.push({ status: ['active', 'paused', 'archived'].includes(q.status) ? q.status : 'active' });
  const text = String(q.q || '').trim().slice(0, 50);
  if (text) { const rx = new RegExp(escapeRegex(text), 'i'); and.push({ $or: [{ name: rx }, { phone: rx }] }); }
  return { filter: { $and: and }, enrollmentFilter: ef };
}

const countStudents = async (user, q) => Student.countDocuments((await buildStudentFilter(user, q)).filter);

module.exports = { buildEnrollmentFilter, buildStudentFilter, countStudents };
