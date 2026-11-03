const mongoose = require('mongoose');
const config = require('./config');
const { buildApp } = require('./app');
const { bootstrapAdmin } = require('./bootstrap');

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ متصل بقاعدة البيانات');
  const { migrate, dropLegacyIndexes } = require('./lib/migrate');
  await dropLegacyIndexes();
  await migrate(); // قبل بناء الفهارس الجديدة
  await require('./models/User').init(); // إنشاء الفهارس
  for (const m of Object.values(require('./models'))) {
    try { await m.init(); } catch (err) { console.error(`فهرس ${m.modelName}:`, err.message); }
  }
  await bootstrapAdmin();

  require('./lib/jobs').start();
  const app = buildApp();
  app.listen(config.port, () => console.log(`🚀 يعمل على المنفذ ${config.port}`));
}

main().catch((err) => {
  console.error('فشل التشغيل:', err.message);
  process.exit(1);
});
