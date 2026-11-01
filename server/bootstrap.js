const bcrypt = require('bcryptjs');
const User = require('./models/User');
const config = require('./config');
const { isValidPassword, PASSWORD_MESSAGE } = require('./utils/password');

// ينشئ أول مدير نظام إذا لم يوجد أي مدير، وبشرط ضبط المتغيرات في البيئة.
async function bootstrapAdmin() {
  if (await User.exists({ role: 'admin' })) return;
  const { name, username, password } = config.initialAdmin;
  if (!username || !password) {
    console.warn('⚠️ لا يوجد مدير نظام. اضبط INITIAL_ADMIN_USERNAME و INITIAL_ADMIN_PASSWORD ثم أعد التشغيل.');
    return;
  }
  if (!isValidPassword(password)) throw new Error('INITIAL_ADMIN_PASSWORD: ' + PASSWORD_MESSAGE);
  await User.create({ name, username, role: 'admin', passwordHash: await bcrypt.hash(password, 12) });
  console.log(`✅ تم إنشاء مدير النظام الأول (${username}). احذف INITIAL_ADMIN_PASSWORD من الإعدادات الآن.`);
}

module.exports = { bootstrapAdmin };
