const AuditLog = require('../models/AuditLog');
const { Backup } = require('../models');
const { getSettings, saveSettings } = require('./settings');
const { createBackup } = require('./backup');

const DAY = 24 * 3600 * 1000;

// حذف سجلات العمليات القديمة فقط، بحسب مدة الاحتفاظ. لا يمس أي بيانات أخرى.
async function auditCleanup() {
  const s = await getSettings();
  if (s.lastAuditCleanupAt && Date.now() - new Date(s.lastAuditCleanupAt).getTime() < DAY) return;
  const cutoff = new Date(Date.now() - s.auditRetentionDays * DAY);
  const r = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  await saveSettings({ lastAuditCleanupAt: new Date() });
  await AuditLog.create({ action: 'audit.cleanup', targetType: 'audit', details: { retentionDays: s.auditRetentionDays, deleted: r.deletedCount, cutoff } });
}

async function weeklyBackup() {
  const last = await Backup.findOne({ kind: 'auto', status: 'success' }).sort({ createdAt: -1 }).lean();
  if (last && Date.now() - new Date(last.createdAt).getTime() < 7 * DAY) return;
  await createBackup('auto');
}

function start() {
  const tick = async () => {
    for (const job of [auditCleanup, weeklyBackup]) {
      try { await job(); } catch (e) { console.error(`job ${job.name} failed:`, e.message); }
    }
  };
  setTimeout(tick, 30 * 1000); // بعد التشغيل بنصف دقيقة، ثم كل ساعة
  setInterval(tick, 3600 * 1000).unref();
}

module.exports = { start };
