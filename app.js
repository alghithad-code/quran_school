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
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
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

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

  // تقديم الواجهة المبنية
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
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
