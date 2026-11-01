const { Setting } = require('../models');

const DEFAULTS = {
  gradeScale: [
    { key: 'excellent', label: 'ممتاز', score: 5 },
    { key: 'very_good', label: 'جيد جداً', score: 4 },
    { key: 'good', label: 'جيد', score: 3 },
    { key: 'acceptable', label: 'مقبول', score: 2 },
    { key: 'weak', label: 'ضعيف', score: 1 },
    { key: 'redo', label: 'لم يتقن / يحتاج إلى إعادة', score: 0 },
  ],
  auditRetentionDays: 365,
  absenceThreshold: 3, // عدد أيام الغياب المتتالية لإرسال تنبيه
  backupKeep: 8, // عدد النسخ التلقائية المحتفظ بها
  lastAuditCleanupAt: null,
};

async function getSettings() {
  const doc = await Setting.findOne({ key: 'main' }).lean();
  return { ...DEFAULTS, ...(doc?.value || {}) };
}
async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await Setting.updateOne({ key: 'main' }, { $set: { value: next } }, { upsert: true });
  return next;
}
const scoreMap = (s) => Object.fromEntries(s.gradeScale.map((g) => [g.key, g.score]));

module.exports = { getSettings, saveSettings, scoreMap, DEFAULTS };
