const mongoose = require('mongoose');

// سجل العمليات: يُنشأ من الخادم فقط، ولا توجد أي واجهة لتعديله.
const auditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: String,
    action: { type: String, required: true, index: true },
    targetType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    targetLabel: String,
    details: mongoose.Schema.Types.Mixed, // قيم سابقة/جديدة
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditSchema);
