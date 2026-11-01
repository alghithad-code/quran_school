import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ---------- توجيه بسيط بالـ hash: #/students/123?filter=absent_today ----------
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}
export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => { setR(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
export const go = (to) => { window.location.hash = to; };
export const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null));
  const s = p.toString();
  return s ? '?' + s : '';
};

// ---------- سياق الإعدادات (سلّم التقييم) ----------
export const SettingsCtx = createContext({ gradeScale: [], absenceThreshold: 3 });
export const useSettings = () => useContext(SettingsCtx);
export const gradeLabel = (scale, key) => scale.find((g) => g.key === key)?.label || key || '—';

// ---------- مكونات ----------
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{title}</h3><button className="btn ghost" onClick={onClose}>إغلاق</button></div>
        {children}
      </div>
    </div>
  );
}

// رسالة نجاح/خطأ تظهر بعد تأكيد الخادم فقط
export function useFlash() {
  const [m, setM] = useState(null);
  const ok = useCallback((text) => setM({ text, ok: true }), []);
  const err = useCallback((e) => setM({ text: e?.message || String(e), ok: false }), []);
  const node = m && <div className={'alert' + (m.ok ? ' good' : '')} onClick={() => setM(null)}>{m.text}</div>;
  return { ok, err, node, clear: () => setM(null) };
}

export function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { setData(await fn()); setError(''); } catch (e) { setError(e.message); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, loading: data === null && !error };
}

export const Loading = () => <p className="muted center">جارٍ التحميل…</p>;
export const ErrorBox = ({ text }) => text ? <div className="alert">{text}</div> : null;
export const Empty = ({ text = 'لا توجد بيانات' }) => <p className="muted center">{text}</p>;

const DT = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' });
export const fmtDT = (v) => (v ? DT.format(new Date(v)) : '—');

export const ROLE_AR = { admin: 'مدير النظام', supervisor: 'مشرف', teacher: 'معلم' };
export const STATUS_AR = { active: 'نشط', paused: 'متوقف', archived: 'مؤرشف', suspended: 'موقوف' };
export const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const CAT_AR = { hifz: 'الحفظ', review: 'المراجعة', behavior: 'السلوك', discipline: 'الانضباط', general: 'عامة' };
export const ACTION_AR = {
  'user.create': 'إنشاء حساب', 'user.update': 'تعديل حساب', 'user.suspend': 'إيقاف حساب', 'user.activate': 'تنشيط حساب', 'user.reset_password': 'إعادة تعيين كلمة مرور', 'user.change_password': 'تغيير كلمة المرور',
  'student.create': 'إضافة طالب', 'student.update': 'تعديل طالب', 'student.status': 'تغيير حالة طالب', 'student.schedule': 'تعديل جدول طالب', 'student.transfer': 'نقل طالب', 'student.transfer_bulk': 'نقل جماعي',
  'student.level_assign': 'تعيين مستوى', 'student.level_promotion': 'ترقية طالب', 'student.level_demotion': 'خفض مستوى طالب',
  'attendance.create': 'تسجيل حضور', 'attendance.bulk': 'تحضير جماعي', 'group.create': 'إضافة مجموعة', 'group.update': 'تعديل مجموعة', 'group.delete': 'حذف مجموعة', 'group.members': 'تعديل أعضاء مجموعة', 'attendance.update': 'تعديل حضور', 'recitation.create': 'تسجيل حفظ/مراجعة', 'recitation.update': 'تعديل حفظ/مراجعة', 'note.create': 'إضافة ملاحظة', 'note.update': 'تعديل ملاحظة',
  'level.create': 'إضافة مستوى', 'level.update': 'تعديل مستوى', 'level.delete': 'حذف مستوى', 'level.reorder': 'ترتيب المستويات', 'level.assign_teacher': 'ربط معلم بمستويات',
  'promotion.request': 'طلب ترقية', 'promotion.approve': 'قبول ترقية', 'promotion.reject': 'رفض ترقية',
  'settings.update': 'تعديل الإعدادات', 'backup.create': 'إنشاء نسخة احتياطية', 'backup.download': 'تنزيل نسخة', 'backup.upload': 'رفع نسخة', 'audit.cleanup': 'تنظيف سجل العمليات',
};

// يحوّل رابط الإشعار القادم من الخادم إلى مسار الواجهة
// زر أيقونة مربّع مدوّر (يُصفّ مع غيره داخل .irow). caption يجعله زراً أعرض بنص.
export function IconBtn({ icon, label, caption, onClick, href, tone = '', on = false, disabled = false }) {
  const cls = ['ibtn', caption ? 'wide' : '', tone, on ? 'on' : ''].filter(Boolean).join(' ');
  const inner = (<><Icon name={icon} size={20} />{caption && <span>{caption}</span>}</>);
  if (href && !disabled) {
    const ext = href.startsWith('http');
    return <a className={cls} href={href} title={label} aria-label={label} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>;
  }
  return <button type="button" className={cls} title={label} aria-label={label || caption} onClick={onClick} disabled={disabled}>{inner}</button>;
}
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'م' : 'ص'}`;
}
export const initial = (name) => Array.from(String(name || '?').trim())[0] || '?';

export const GOAL_AR = { full_review: 'مراجعة كاملة', surah_review: 'مراجعة سور محددة', tajweed: 'تحسين التجويد', custom: 'هدف آخر' };
export function goalText(g) { return g.goalText ? `${GOAL_AR[g.goalType]}: ${g.goalText}` : GOAL_AR[g.goalType]; }

// شريط تقدّم: pct من 0 إلى 100
export function Progress({ pct, label, thin = false }) {
  const v = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className={'prog' + (thin ? ' thin' : '')}>
      <div className="pbar" role="progressbar" aria-valuenow={v} aria-valuemin="0" aria-valuemax="100"><i style={{ width: v + '%' }} /></div>
      {label && <small className="muted">{label}</small>}
    </div>
  );
}

export const linkTo = (l) => (l ? '#' + l : '#/');

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const FILTER_AR = { present_today: 'حاضرون اليوم', absent_today: 'غائبون اليوم', no_eval_today: 'بلا تقييم اليوم', frequent_absent: 'كثيرو الغياب' };

// ---------- أيقونات رسومية (خطية) وشعار ----------
const ICONS = {
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  menu: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
  book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  up: ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
  chart: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  lock: ['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  check: ['M20 6L9 17l-5-5'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  trash: ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  edit: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  power: ['M18.36 6.64a9 9 0 1 1-12.73 0', 'M12 2v10'],
  repeat: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  chat: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
  down: ['M12 5v14', 'M19 12l-7 7-7-7'],
  arrowup: ['M12 19V5', 'M5 12l7-7 7 7'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  restore: ['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
};
export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICONS[name] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
// شعار: نجمة ثمانية (مربعان متداخلان) بالذهبي مع دائرة مركزية
export function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="9" y="9" width="30" height="30" rx="2" fill="#c9a24a" />
      <rect x="9" y="9" width="30" height="30" rx="2" fill="#c9a24a" transform="rotate(45 24 24)" />
      <circle cx="24" cy="24" r="10" fill="#0b4d3a" />
      <circle cx="24" cy="24" r="5" fill="none" stroke="#c9a24a" strokeWidth="1.6" />
    </svg>
  );
}

// يلخّص قائمة سور: السلاسل المتصلة (3 فأكثر) تُكتب «من X إلى Y»
export function summarizeSurahs(nums, surahs) {
  const a = [...new Set(nums || [])].sort((x, y) => x - y);
  if (!a.length) return 'لم تُحدَّد سور';
  const name = (n) => surahs[n - 1]?.name;
  const parts = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`من ${name(a[i])} إلى ${name(a[j])}`);
    else for (let k = i; k <= j; k += 1) parts.push(name(a[k]));
    i = j + 1;
  }
  return `${a.length} سورة: ${parts.join('، ')}`;
}
