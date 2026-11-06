const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const config = require('./config');

function buildApp() {
  const app = express();
  app.set('trust proxy', 1); // Render خلف بروكسي HTTPS

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          mediaSrc: ["'self'", 'https:'], // تلاوات المصحف تُبث من مصدر خارجي بـ https (عنصر صوت فقط، لا ينفّذ شيفرة)
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(
    session({
      name: 'sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: MongoStore.create({ mongoUrl: config.mongoUri, ttl: config.session.maxAgeMs / 1000, touchAfter: 60 }),
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.isProd,
        maxAge: config.session.maxAgeMs,
      },
    })
  );

  app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    const dbOk = mongoose.connection.readyState === 1;
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk ? 'connected' : 'disconnected' });
  });

  app.use('/api/public/mushaf', require('./routes/mushafPublic')); // عام: قراءة فقط، بلا جلسة
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  const { studentRecords, enrollmentRecords, recordEdit, bulkAttendance } = require('./routes/records');
  app.use('/api/attendance/bulk', bulkAttendance);
  app.use('/api/students/:id', studentRecords);
  app.use('/api/students', require('./routes/students'));
  app.use('/api/enrollments/:eid', enrollmentRecords);
  app.use('/api/enrollments', require('./routes/enrollments'));
  app.use('/api/records', recordEdit);
  app.use('/api/transfers', require('./routes/transfers'));
  app.use('/api/levels', require('./routes/levels'));
  app.use('/api/quran', require('./routes/quran'));
  app.use('/api/mushaf', require('./routes/mushafProgress'));
  app.use('/api/readers', require('./routes/readers'));
  app.use('/api/groups', require('./routes/groups'));
  app.use('/api/promotions', require('./routes/promotions'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/backups', require('./routes/backups'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

  // تقديم الواجهة المبنية
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, {
      index: false,
      maxAge: '1h',
      // ملف الـ Service Worker يجب ألا يُخزَّن مؤقتاً حتى تصل التحديثات
      setHeaders: (res, file) => { if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); },
    }));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // معالج أخطاء: لا نكشف التفاصيل الداخلية للمستخدم
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات غير صالحة' });
    res.status(500).json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' });
  });

  return app;
}

module.exports = { buildApp };
