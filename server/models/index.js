const mongoose = require('mongoose');
const { Schema } = mongoose;
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });

const Level = mongoose.model('Level', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  scope: { type: String, default: '', maxlength: 300 }, // قديم، يُستبدل بقائمة السور
  surahs: { type: [Number], default: [] }, // أرقام السور المحددة يدوياً لهذا المستوى (1-114)
  order: { type: Number, default: 0, index: true },
}, { timestamps: true }));

// مجموعة ذات هدف (مراجعة كاملة / مراجعة سور / تحسين تجويد / هدف يدوي). الطالب والمعلم قد يكونان في مجموعات ومستويات معاً.
const Group = mongoose.model('Group', (() => {
  const s = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    goalType: { type: String, enum: ['full_review', 'surah_review', 'tajweed', 'custom'], default: 'custom' }, // قديم: المجموعات الآن للرسائل فقط
    goalText: { type: String, default: '', maxlength: 300 },
    surahs: { type: [Number], default: [] },
    teacherIds: [oid('User')],
    studentIds: [oid('Student')],
    createdBy: oid('User'),
  }, { timestamps: true });
  s.index({ studentIds: 1 });
  s.index({ teacherIds: 1 });
  return s;
})());

// رسالة جماعية لمجموعة: لقطة بأعضاء المجموعة وأرقامهم وقت الإنشاء، وحالة كل مستلم (أُرسل له أم لا)
const GroupMessage = mongoose.model('GroupMessage', new Schema({
  groupId: oid('Group', { required: true, index: true }),
  text: { type: String, required: true, maxlength: 600 },
  createdBy: oid('User'),
  recipients: [{
    _id: false,
    studentId: oid('Student'), name: String, phone: String,
    status: { type: String, enum: ['pending', 'opened', 'nophone'], default: 'pending' },
    openedAt: Date,
  }],
}, { timestamps: { createdAt: true, updatedAt: false } }));

const Student = mongoose.model('Student', (() => {
  const s = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    age: { type: Number, min: 3, max: 100 },
    phone: { type: String, default: '' },
    enrolledAt: { type: String, required: true }, // تاريخ الالتحاق بالمجتمع YYYY-MM-DD
    notes: { type: String, default: '', maxlength: 1000 }, // ملاحظات عامة (للمشرف)
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
    createdBy: oid('User'),
  }, { timestamps: true });
  s.index({ name: 1 });
  return s;
})());

// تسجيل الطالب في مستوى: لكل تسجيل معلمه وجدوله وموضع حفظه وحضوره وسجلاته المستقلة.
const Enrollment = mongoose.model('Enrollment', (() => {
  const s = new Schema({
    studentId: oid('Student', { required: true, index: true }),
    teacherId: oid('User', { required: true, index: true }),
    levelId: oid('Level', { default: null, index: true }),
    position: { type: String, default: '', maxlength: 200 }, // موضع الحفظ في هذا المستوى
    notes: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
    startedAt: { type: String },
    schedule: {
      days: { type: [Number], default: [] }, // 0=الأحد
      arrivalTime: { type: String, default: '' },
      startTime: { type: String, default: '' },
      endTime: { type: String, default: '' },
      notes: { type: String, default: '', maxlength: 300 },
    },
    lastAbsenceAlert: { type: String, default: '' }, // مفتاح آخر تنبيه غياب أُرسل (بداية السلسلة|طولها) لمنع تكراره
    createdBy: oid('User'),
  }, { timestamps: true });
  s.index({ studentId: 1, status: 1 });
  s.index({ status: 1, studentId: 1 }); // يسرّع جلب معرّفات الطلاب ذوي التسجيل النشط
  return s;
})());

const recordBase = {
  studentId: oid('Student', { required: true }),
  enrollmentId: oid('Enrollment', { required: true }),
  date: { type: String, required: true }, // YYYY-MM-DD بتوقيت المجتمع
  createdBy: oid('User', { required: true }),
  updatedBy: oid('User'),
};

const Attendance = mongoose.model('Attendance', (() => {
  const s = new Schema({ ...recordBase, status: { type: String, enum: ['present', 'absent'], required: true }, note: { type: String, default: '', maxlength: 300 } }, { timestamps: true });
  s.index({ enrollmentId: 1, date: 1 }, { unique: true }); // سجل حضور واحد لكل تسجيل في اليوم
  s.index({ studentId: 1, date: -1 });
  s.index({ date: 1, status: 1 });
  return s;
})());

const Recitation = mongoose.model('Recitation', (() => {
  const s = new Schema({
    ...recordBase,
    type: { type: String, enum: ['hifz', 'review'], required: true },
    mode: { type: String, enum: ['surah', 'page'], required: true },
    surah: Number, fromAyah: Number, toAyah: Number,
    fromPage: Number, toPage: Number,
    grade: { type: String, default: null }, // مفتاح من سلّم التقييم
  }, { timestamps: true });
  s.index({ enrollmentId: 1, date: -1 });
  s.index({ studentId: 1, date: -1 });
  s.index({ date: 1, type: 1 });
  return s;
})());

const Note = mongoose.model('Note', (() => {
  const s = new Schema({
    ...recordBase,
    category: { type: String, enum: ['hifz', 'review', 'behavior', 'discipline', 'general'], required: true },
    text: { type: String, required: true, maxlength: 1000 },
    visibleToStudent: { type: Boolean, default: false }, // لا يراها الطالب إلا إن حدّدها المعلم (الملاحظات القديمة تبقى مخفية)
  }, { timestamps: true });
  s.index({ studentId: 1, date: -1 });
  return s;
})());

const Transfer = mongoose.model('Transfer', new Schema({
  studentId: oid('Student', { required: true, index: true }),
  enrollmentId: oid('Enrollment'),
  fromTeacherId: oid('User'), toTeacherId: oid('User', { required: true }),
  byId: oid('User', { required: true }), batchId: String,
}, { timestamps: { createdAt: true, updatedAt: false } }));

const LevelChange = mongoose.model('LevelChange', new Schema({
  studentId: oid('Student', { required: true, index: true }),
  enrollmentId: oid('Enrollment'),
  fromLevelId: oid('Level', { default: null }), toLevelId: oid('Level', { required: true }),
  type: { type: String, enum: ['assign', 'promotion', 'demotion'], required: true },
  reason: { type: String, default: '', maxlength: 500 },
  byId: oid('User', { required: true }), requestId: oid('PromotionRequest', { default: null }),
}, { timestamps: { createdAt: true, updatedAt: false } }));

const PromotionRequest = mongoose.model('PromotionRequest', new Schema({
  studentId: oid('Student', { required: true, index: true }),
  enrollmentId: oid('Enrollment', { index: true }),
  teacherId: oid('User', { required: true, index: true }),
  fromLevelId: oid('Level'), toLevelId: oid('Level', { required: true }),
  note: { type: String, default: '', maxlength: 1000 },
  snapshot: Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decisionNote: { type: String, default: '', maxlength: 500 },
  decidedBy: oid('User'), decidedAt: Date,
}, { timestamps: true }));

const Notification = mongoose.model('Notification', (() => {
  const s = new Schema({
    userId: oid('User', { required: true }),
    type: String, title: { type: String, required: true }, body: { type: String, default: '' },
    link: { type: String, default: '' }, read: { type: Boolean, default: false },
  }, { timestamps: { createdAt: true, updatedAt: false } });
  s.index({ userId: 1, read: 1, createdAt: -1 });
  return s;
})());

const Setting = mongoose.model('Setting', new Schema({
  key: { type: String, unique: true }, value: Schema.Types.Mixed,
}, { timestamps: true }));

const Backup = mongoose.model('Backup', new Schema({
  kind: { type: String, enum: ['auto', 'manual', 'pre-restore', 'uploaded'], required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  filename: String, fileId: Schema.Types.ObjectId, size: Number, checksum: String,
  counts: Schema.Types.Mixed, error: String, createdBy: oid('User'),
}, { timestamps: { createdAt: true, updatedAt: false } }));

// قارئ للمصحف الشريف: urlTemplate رابط ملف الآية الواحدة ويحوي {s} رقم السورة و{a} رقم الآية (3 خانات: 001)
const Reader = mongoose.model('Reader', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  urlTemplate: { type: String, required: true, maxlength: 300 },
  enabled: { type: Boolean, default: true },
  builtin: { type: Boolean, default: false },
  order: { type: Number, default: 0, index: true },
  createdBy: oid('User'),
}, { timestamps: true }));

module.exports = { Reader, Level, Group, GroupMessage, Student, Enrollment, Attendance, Recitation, Note, Transfer, LevelChange, PromotionRequest, Notification, Setting, Backup };
