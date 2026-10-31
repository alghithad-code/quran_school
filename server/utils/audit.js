const AuditLog = require('../models/AuditLog');

async function audit(req, action, { targetType, target, details } = {}) {
  try {
    await AuditLog.create({
      actorId: req.user?._id,
      actorName: req.user?.name,
      action,
      targetType,
      targetId: target?._id,
      targetLabel: target?.name || target?.username,
      details,
      ip: req.ip,
    });
  } catch (err) {
    // فشل التوثيق لا يجب أن يخفي نتيجة العملية، لكنه يُسجَّل تقنياً
    console.error('audit failed:', err.message);
  }
}

module.exports = { audit };
