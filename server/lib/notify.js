const User = require('../models/User');
const { Notification } = require('../models');

// ينشئ إشعارات للمستخدمين النشطين فقط، دون تكرار.
async function notify(userIds, { type, title, body = '', link = '' }) {
  try {
    const ids = [...new Set(userIds.filter(Boolean).map(String))];
    if (!ids.length) return;
    const active = await User.find({ _id: { $in: ids }, status: 'active' }).select('_id').lean();
    if (!active.length) return;
    await Notification.insertMany(active.map((u) => ({ userId: u._id, type, title, body, link })));
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}
async function managerIds() {
  const m = await User.find({ role: { $in: ['admin', 'supervisor'] }, status: 'active' }).select('_id').lean();
  return m.map((u) => u._id);
}

module.exports = { notify, managerIds };
