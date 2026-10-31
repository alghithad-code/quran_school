const mongoose = require('mongoose');
const config = require('./config');
const { buildApp } = require('./app');
const { bootstrapAdmin } = require('./bootstrap');

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ متصل بقاعدة البيانات');
  await require('./models/User').init(); // إنشاء الفهارس
  await bootstrapAdmin();

  const app = buildApp();
  app.listen(config.port, () => console.log(`🚀 يعمل على المنفذ ${config.port}`));
}

main().catch((err) => {
  console.error('فشل التشغيل:', err.message);
  process.exit(1);
});
