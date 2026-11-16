const { Reader } = require('../models');

// نطاقات القراء المفعّلين، لتسمح سياسة الأمان (CSP) للمتصفح بتحميل التلاوات للاستماع دون إنترنت.
// تُحدَّث تلقائياً كل دقيقة، وفوراً عند تعديل القراء.
const BASE = ['everyayah.com'];
let hosts = BASE.slice();
let last = 0;

async function refreshReaderHosts() {
  last = Date.now();
  try {
    const list = await Reader.find({ enabled: true }).select('urlTemplate').lean();
    const set = new Set(BASE);
    for (const r of list) {
      try {
        const h = new URL(String(r.urlTemplate).replace(/\{[sa]\}/g, '001')).hostname.toLowerCase();
        if (/^[a-z0-9.-]+$/.test(h)) set.add(h);
      } catch { /* قالب غير صالح يُتجاهل */ }
    }
    hosts = [...set];
  } catch { /* تبقى القائمة السابقة */ }
}

// قيمة connect-src: تُستدعى مع كل استجابة، وتبدأ التحديث في الخلفية إذا مضت دقيقة
function connectHosts() {
  if (Date.now() - last > 60 * 1000) refreshReaderHosts();
  return hosts.map((h) => 'https://' + h).join(' ');
}

module.exports = { refreshReaderHosts, connectHosts };
