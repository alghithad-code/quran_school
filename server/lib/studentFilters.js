const mongoose = require('mongoose');
const { Student, Attendance, Recitation } = require('../models');
const { studentScope } = require('./access');
const { getSettings } = require('./settings');
const { todayStr, addDays, weekday } = require('../utils/dates');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// يبني فلتر الطلاب من معاملات الاستعلام. تستخدمه القوائم ولوحة التحكم ليتطابق الرقم مع القائمة.
async function buildStudentQuery(user, q = {}) {
  const and = [studentScope(user)];
  const today = todayStr();
  if (q.status !== 'all') and.push({ status: ['active', 'paused', 'archived'].includes(q.status) ? q.status : 'active' });
  if (user.role !== 'teacher' && mongoose.isValidObjectId(q.teacherId)) and.push({ teacherId: q.teacherId });
  if (q.levelId === 'none') and.push({ levelId: null });
  else if (mongoose.isValidObjectId(q.levelId)) and.push({ levelId: q.levelId });
  const text = String(q.q || '').trim().slice(0, 50);
  if (text) { const rx = new RegExp(escapeRegex(text), 'i'); and.push({ $or: [{ name: rx }, { phone: rx }] }); }
  if (q.today === '1') and.push({ 'schedule.days': weekday(today) });

  switch (q.filter) {
    case 'present_today':
    case 'absent_today': {
      const ids = await Attendance.distinct('studentId', { date: today, status: q.filter === 'present_today' ? 'present' : 'absent' });
      and.push({ _id: { $in: ids } });
      break;
    }
    case 'no_eval_today': {
      // طلاب موعدهم اليوم أو سُجّل لهم حضور اليوم، ولم يُسجَّل لهم تقييم اليوم
      const [attended, graded] = await Promise.all([
        Attendance.distinct('studentId', { date: today }),
        Recitation.distinct('studentId', { date: today, grade: { $ne: null } }),
      ]);
      and.push({ status: 'active' }, { $or: [{ 'schedule.days': weekday(today) }, { _id: { $in: attended } }] }, { _id: { $nin: graded } });
      break;
    }
    case 'frequent_absent': {
      const { absenceThreshold } = await getSettings();
      const rows = await Attendance.aggregate([
        { $match: { status: 'absent', date: { $gte: addDays(today, -13), $lte: today } } },
        { $group: { _id: '$studentId', n: { $sum: 1 } } },
        { $match: { n: { $gte: absenceThreshold } } },
      ]);
      and.push({ _id: { $in: rows.map((r) => r._id) } });
      break;
    }
    default:
  }
  return { $and: and };
}

module.exports = { buildStudentQuery };
