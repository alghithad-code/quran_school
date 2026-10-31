require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function need(key) {
  const v = process.env[key];
  if (!v) throw new Error(`متغير البيئة مفقود: ${key}`);
  return v;
}

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri: need('MONGODB_URI'),
  sessionSecret: need('SESSION_SECRET'),
  timezone: process.env.SCHOOL_TIMEZONE || 'Asia/Riyadh',
  initialAdmin: {
    name: process.env.INITIAL_ADMIN_NAME || 'مدير النظام',
    username: (process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase(),
    password: process.env.INITIAL_ADMIN_PASSWORD || '',
  },
  session: { maxAgeMs: 8 * 60 * 60 * 1000 },
  lock: { maxFailures: 5, lockMs: 15 * 60 * 1000 },
};

if (isProd && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET يجب ألا يقل عن 32 حرفاً في الإنتاج');
}

module.exports = config;
