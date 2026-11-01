const mongoose = require('mongoose');

const ROLES = ['admin', 'supervisor', 'teacher'];
const STATUSES = ['active', 'suspended'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    phone: { type: String, default: '' }, // بصيغة دولية بلا + مثل 9665XXXXXXXX
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: STATUSES, default: 'active', index: true },
    passwordHash: { type: String, required: true, select: false },
    levelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Level' }], // تُستخدم في المرحلة 5
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });
userSchema.index({ phone: 1 });

userSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    name: this.name,
    username: this.username,
    phone: this.phone,
    role: this.role,
    status: this.status,
    levelIds: this.levelIds,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;
