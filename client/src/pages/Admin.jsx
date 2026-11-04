import { useRef, useState } from 'react';
import { api, upload } from '../api.js';
import { Empty, IconBtn, Loading, fmtDT, useFlash, useLoad } from '../ui.jsx';

const KIND = { auto: 'تلقائية', manual: 'يدوية', 'pre-restore': 'قبل استعادة', uploaded: 'مرفوعة' };
const mb = (n) => (n ? (n / 1024 / 1024).toFixed(2) + ' م.ب' : '—');

export default function Admin({ online }) {
  const st = useLoad(() => api('/settings'), []);
  const bk = useLoad(() => api('/backups'), []);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const file = useRef();
  if (st.data && !s) setS({ ...st.data, gradeScale: st.data.gradeScale.map((g) => ({ ...g })) });
  if (!s) return <Loading />;

  async function run(fn, ok) {
    setBusy(true); flash.clear();
    try { const r = await fn(); flash.ok(ok); await bk.reload(); return r; } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const saveSettings = (e) => {
    e.preventDefault();
    run(() => api('/settings', { method: 'PATCH', body: { gradeScale: s.gradeScale, auditRetentionDays: s.auditRetentionDays, absenceThreshold: s.absenceThreshold, backupKeep: s.backupKeep, teachersCanAddStudents: !!s.teachersCanAddStudents } }), 'تم حفظ الإعدادات (يُطبَّق سلّم التقييم الجديد بعد إعادة فتح التطبيق)');
  };
  const setG = (i, k, v) => setS((x) => ({ ...x, gradeScale: x.gradeScale.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));

  async function restore(b) {
    const c = prompt(`استعادة «${b.filename}» ستستبدل كل البيانات الحالية.\nيُنشأ قبلها نسخة أمان تلقائياً.\nاكتب كلمة: استعادة`);
    if (c === null) return;
    setBusy(true); flash.clear();
    try {
      const r = await api(`/backups/${b.id}/restore`, { method: 'POST', body: { confirm: c } });
      alert('تمت الاستعادة بنجاح. نسخة الأمان: ' + r.safety + '\nسجّل الدخول من جديد.');
      window.location.reload();
    } catch (e) { flash.err(e); setBusy(false); }
  }
  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    run(() => upload('/backups/upload', f), 'تم رفع النسخة والتحقق منها. يمكنك استعادتها من القائمة.');
  }

  return (
    <div>
      <h2 className="h">الإعدادات والنسخ الاحتياطي</h2>
      {flash.node}
      <form className="card" onSubmit={saveSettings}>
        <h3>سلّم التقييم</h3>
        <p className="small muted">الدرجة تُستخدم لحساب المتوسطات. لا يمكن حذف تقييم استُخدم سابقاً، لكن يمكن تعديل اسمه ودرجته أو إضافة تقييم.</p>
        {s.gradeScale.map((g, i) => (
          <div className="row" key={g.key || i}>
            <input className="grow" value={g.label} onChange={(e) => setG(i, 'label', e.target.value)} required />
            <input style={{ width: 80 }} type="number" step="0.5" value={g.score} onChange={(e) => setG(i, 'score', e.target.value)} required />
          </div>
        ))}
        <button type="button" className="btn ghost" onClick={() => setS((x) => ({ ...x, gradeScale: [...x.gradeScale, { label: '', score: 0 }] }))}>+ تقييم</button>
        <h3 style={{ marginTop: 16 }}>الصلاحيات</h3>
        <label className="check"><input type="checkbox" checked={!!s.teachersCanAddStudents} onChange={(e) => setS({ ...s, teachersCanAddStudents: e.target.checked })} />السماح للمعلمين بإضافة طلاب</label>
        <p className="small muted">عند التفعيل يضيف المعلم طلاباً إلى نفسه فقط، وبمستويات مُعيَّنة له، ويصل إشعار للمشرفين. يُطبَّق فوراً في الخادم.</p>
        <h3 style={{ marginTop: 16 }}>خيارات عامة</h3>
        <label>أيام الغياب المتتالية لإرسال تنبيه<input type="number" min="1" max="30" value={s.absenceThreshold} onChange={(e) => setS({ ...s, absenceThreshold: e.target.value })} /></label>
        <label>مدة الاحتفاظ بسجل العمليات (أيام)<input type="number" min="30" value={s.auditRetentionDays} onChange={(e) => setS({ ...s, auditRetentionDays: e.target.value })} /></label>
        <label>عدد النسخ التلقائية المحتفظ بها<input type="number" min="1" max="52" value={s.backupKeep} onChange={(e) => setS({ ...s, backupKeep: e.target.value })} /></label>
        <button className="btn block" disabled={busy || !online}>حفظ الإعدادات</button>
      </form>

      <div className="card">
        <h3>النسخ الاحتياطي</h3>
        <p className="small muted">تُنشأ نسخة تلقائية أسبوعياً. نزّل نسخة دورية واحفظها خارج الاستضافة. الملف يحتوي بيانات المجتمع وتجزئات كلمات المرور، فاحفظه بسرية.</p>
        <div className="irow" style={{ marginBottom: 10 }}>
          <IconBtn icon="plus" tone="on" caption="نسخة الآن" label="إنشاء نسخة احتياطية" disabled={busy || !online} onClick={() => run(() => api('/backups', { method: 'POST' }), 'تم إنشاء النسخة')} />
          <IconBtn icon="upload" caption="رفع نسخة" label="رفع نسخة محفوظة" disabled={busy || !online} onClick={() => file.current.click()} />
          <input ref={file} type="file" accept=".gz,application/gzip" hidden onChange={onFile} />
        </div>
        {bk.loading && <Loading />}
        {bk.data?.items.length === 0 && <Empty text="لا توجد نسخ بعد" />}
        {bk.data?.items.map((b) => (
          <div className="rec" key={b.id}>
            <div className="row between" style={{ marginBottom: 2 }}><b>{KIND[b.kind]}</b><span className={'tag ' + (b.status === 'success' ? 'ok' : 'bad')}>{b.status === 'success' ? 'ناجحة' : 'فاشلة'}</span></div>
            <div className="small muted">{fmtDT(b.at)} · {mb(b.size)}</div>
            {b.error && <div className="small c-bad">{b.error}</div>}
            {b.status === 'success' && (
              <div className="irow" style={{ marginTop: 6 }}>
                <IconBtn icon="download" tone="ok" label="تنزيل النسخة" href={`/api/backups/${b.id}/download`} />
                <IconBtn icon="restore" tone="danger" label="استعادة هذه النسخة" disabled={busy || !online} onClick={() => restore(b)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
