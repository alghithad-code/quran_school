// التحقق من طلب التسجيل الجماعي للحفظ/المراجعة (دالة نقية). لكل سورة: كاملة (يحدد النظام آياتها) أو آيات من/إلى،
// والتقييم موحّد للجميع (gradeMode: 'same') أو مستقل لكل سورة (gradeMode: 'each').
const { SURAHS } = require('../data/quran');

const MAX_ITEMS = 60;
const int = (v) => (v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v)) ? Number(v) : NaN);

function cleanBatch(body, { levelSurahs = [], gradeKeys = [] } = {}) {
  const b = body || {};
  if (!['hifz', 'review'].includes(b.type)) return { error: 'اختر نوع التسجيل: حفظ أو مراجعة' };
  if (!levelSurahs.length) return { error: 'لا توجد سور محددة لمستوى الطالب. حدّدها من إدارة المستويات، أو استخدم التسجيل العادي' };
  if (!Array.isArray(b.items) || !b.items.length) return { error: 'اختر سورة واحدة على الأقل' };
  if (b.items.length > MAX_ITEMS) return { error: `الحد الأقصى ${MAX_ITEMS} سورة في العملية الواحدة` };
  const gradeMode = b.gradeMode === 'each' ? 'each' : 'same';
  const okGrade = (g) => !g || gradeKeys.includes(g);
  if (gradeMode === 'same' && !okGrade(b.grade)) return { error: 'التقييم غير صحيح' };

  const allowed = new Set(levelSurahs);
  const seen = new Set();
  const items = [];
  for (const it of b.items) {
    const surah = int(it?.surah);
    const s = SURAHS[surah - 1];
    if (!s) return { error: 'سورة غير صحيحة' };
    if (!allowed.has(surah)) return { error: `سورة ${s.name} ليست من سور مستوى الطالب` };
    if (seen.has(surah)) return { error: `سورة ${s.name} مكررة في العملية` };
    seen.add(surah);
    let from, to;
    if (it.scope === 'full') { from = 1; to = s.ayahs; } // السورة كاملة: يحدد النظام النطاق تلقائياً
    else if (it.scope === 'range') {
      from = int(it.fromAyah); to = int(it.toAyah);
      if (!(from >= 1) || !(to >= from) || to > s.ayahs) return { error: `سورة ${s.name}: الآيات يجب أن تكون بين 1 و${s.ayahs} (من ≤ إلى)` };
    } else return { error: `سورة ${s.name}: اختر السورة كاملة أو آيات محددة` };
    const grade = gradeMode === 'same' ? (b.grade || null) : (it.grade || null);
    if (!okGrade(grade)) return { error: `سورة ${s.name}: التقييم غير صحيح` };
    items.push({ surah, fromAyah: from, toAyah: to, grade });
  }
  const requestId = b.requestId === undefined ? null : String(b.requestId);
  if (requestId !== null && !/^[\w-]{8,64}$/.test(requestId)) return { error: 'معرّف الطلب غير صحيح' };
  return { value: { type: b.type, items, requestId } };
}

module.exports = { cleanBatch, MAX_ITEMS };
