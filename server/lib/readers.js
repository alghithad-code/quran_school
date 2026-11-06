const { Reader, Setting } = require('../models');

// القراء المبدئيون: ملفات الآية الواحدة من everyayah.com (بث خارجي، لا تُخزَّن في الخادم).
// الصيغة: {s} رقم السورة و{a} رقم الآية بثلاث خانات. يستطيع مدير النظام تعديل القائمة أو إضافة قراء من شاشة «القراء».
const DEFAULT_READERS = [
  ['عبدالرحمن السديس', 'Abdurrahmaan_As-Sudais_192kbps'],
  ['ماهر المعيقلي', 'MaherAlMuaiqly128kbps'],
  ['مشاري العفاسي', 'Alafasy_128kbps'],
  ['عبدالباسط عبدالصمد (مرتل)', 'Abdul_Basit_Murattal_192kbps'],
  ['محمود خليل الحصري', 'Husary_128kbps'],
  ['محمد صديق المنشاوي (مرتل)', 'Minshawy_Murattal_128kbps'],
];

// يزرع القراء المبدئيين مرة واحدة فقط (علامة في الإعدادات)، فلا يعودون إن حذفهم المدير.
async function seedReaders() {
  if (await Setting.exists({ key: 'readersSeeded' })) return;
  if (!(await Reader.exists({}))) {
    await Reader.insertMany(DEFAULT_READERS.map(([name, folder], i) => ({
      name, urlTemplate: `https://everyayah.com/data/${folder}/{s}{a}.mp3`, builtin: true, order: i + 1,
    })));
  }
  await Setting.updateOne({ key: 'readersSeeded' }, { $set: { value: true } }, { upsert: true });
}

// تحقق من رابط القارئ: https فقط، اسم نطاق عام (لا IP ولا localhost ولا بيانات دخول)، ويحوي {s} و{a}
function validateTemplate(t) {
  const v = String(t || '').trim();
  if (v.length > 300) return { error: 'الرابط طويل جداً' };
  if (!v.includes('{s}') || !v.includes('{a}')) return { error: 'يجب أن يحوي الرابط {s} لرقم السورة و{a} لرقم الآية، مثل .../{s}{a}.mp3' };
  let u;
  try { u = new URL(v.replace(/\{s\}/g, '001').replace(/\{a\}/g, '001')); } catch { return { error: 'الرابط غير صالح' }; }
  if (u.protocol !== 'https:') return { error: 'يجب أن يبدأ الرابط بـ https://' };
  if (u.username || u.password) return { error: 'لا يُسمح ببيانات دخول داخل الرابط' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':')) return { error: 'استخدم اسم نطاق عاماً (وليس عنوان IP أو جهازاً محلياً)' };
  return { value: v };
}

const presentReader = (r, admin = false) => ({ id: String(r._id), name: r.name, urlTemplate: r.urlTemplate, ...(admin ? { enabled: r.enabled, builtin: r.builtin, order: r.order } : {}) });

module.exports = { seedReaders, validateTemplate, presentReader, DEFAULT_READERS };
