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
  'attendance.create': 'تسجيل حضور', 'attendance.update': 'تعديل حضور', 'recitation.create': 'تسجيل حفظ/مراجعة', 'recitation.update': 'تعديل حفظ/مراجعة', 'note.create': 'إضافة ملاحظة', 'note.update': 'تعديل ملاحظة',
  'level.create': 'إضافة مستوى', 'level.update': 'تعديل مستوى', 'level.delete': 'حذف مستوى', 'level.reorder': 'ترتيب المستويات', 'level.assign_teacher': 'ربط معلم بمستويات',
  'promotion.request': 'طلب ترقية', 'promotion.approve': 'قبول ترقية', 'promotion.reject': 'رفض ترقية',
  'settings.update': 'تعديل الإعدادات', 'backup.create': 'إنشاء نسخة احتياطية', 'backup.download': 'تنزيل نسخة', 'backup.upload': 'رفع نسخة', 'audit.cleanup': 'تنظيف سجل العمليات',
};

// يحوّل رابط الإشعار القادم من الخادم إلى مسار الواجهة
export const linkTo = (l) => (l ? '#' + l : '#/');

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const FILTER_AR = { present_today: 'حاضرون اليوم', absent_today: 'غائبون اليوم', no_eval_today: 'بلا تقييم اليوم', frequent_absent: 'كثيرو الغياب' };
