import { useState } from 'react';
import { api } from '../api.js';
import { IconBtn, Modal, fmtDT, useFlash, useLoad } from '../ui.jsx';

// بطاقة «حساب الطالب» في صفحة الطالب لدى الموظفين: إنشاء، إعادة تعيين كلمة المرور، إيقاف، تعديل الاسم، حذف
export default function StudentAccount({ studentId, studentActive, isManager, online }) {
  const ld = useLoad(() => api(`/students/${studentId}/account`), [studentId]);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const flash = useFlash();
  const acct = ld.data?.account;
  const base = `/students/${studentId}/account`;

  async function run(fn, okText, after) {
    setBusy(true); flash.clear();
    try { const r = await fn(); setModal(null); if (okText) flash.ok(okText); ld.reload(); if (after) after(r); } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const showCreds = (r) => { setCopied(false); setModal({ creds: { username: r.account.username, password: r.password } }); };
  async function copy(c) {
    const msg = `اسم المستخدم: ${c.username}\nكلمة المرور المؤقتة: ${c.password}\nرابط الدخول: ${window.location.origin}`;
    try { await navigator.clipboard.writeText(msg); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="card">
      <h3>حساب الطالب</h3>
      {flash.node}
      {ld.loading && <p className="muted small">جارٍ التحميل…</p>}
      {ld.error && <div className="alert">{ld.error}</div>}
      {ld.data && !acct && (
        <>
          <p className="small muted">ينشئ للطالب اسم مستخدم وكلمة مرور مؤقتة ليدخل صفحته ويرى تقدمه وحضوره وتقييماته وموعده.</p>
          <IconBtn icon="user" tone="ok" caption="إنشاء حساب" label="إنشاء حساب للطالب" disabled={!online || !studentActive} onClick={() => setModal({ create: { username: '' } })} />
          {!studentActive && <p className="small muted">الطالب غير نشط، فلا يمكن إنشاء حساب له.</p>}
        </>
      )}
      {acct && (
        <>
          <div className="row between">
            <span>اسم المستخدم: <b dir="ltr">{acct.username}</b></span>
            <span className={'tag ' + (acct.status === 'active' ? 'ok' : 'bad')}>{acct.status === 'active' ? 'نشط' : 'موقوف'}</span>
          </div>
          <div className="small muted">{acct.lastLoginAt ? `آخر دخول: ${fmtDT(acct.lastLoginAt)}` : 'لم يدخل بعد'}{acct.mustChangePassword ? ' · لم يغيّر كلمته المؤقتة بعد' : ''}</div>
          <div className="irow" style={{ marginTop: 10 }}>
            <IconBtn icon="lock" tone="gold" label="إعادة تعيين كلمة المرور (كلمة مؤقتة جديدة)" disabled={!online} onClick={() => setModal({ reset: true })} />
            <IconBtn icon="edit" label="تعديل اسم المستخدم" disabled={!online} onClick={() => setModal({ rename: { username: acct.username } })} />
            <IconBtn icon="power" tone={acct.status === 'active' ? 'danger' : 'ok'} label={acct.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'} disabled={busy || !online} onClick={() => run(() => api(base + '/status', { method: 'POST', body: { status: acct.status === 'active' ? 'suspended' : 'active' } }), acct.status === 'active' ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')} />
            {isManager && <IconBtn icon="trash" tone="danger" label="حذف الحساب" disabled={!online} onClick={() => setModal({ del: true })} />}
          </div>
        </>
      )}

      {/* نافذة واحدة تتبدل محتوياتها: تبديل نافذتين مختلفتين في اللحظة نفسها يجعل زر الرجوع الداخلي يغلق الجديدة فوراً */}
      {modal && (
        <Modal
          title={modal.creds ? 'بيانات دخول الطالب' : modal.create ? 'إنشاء حساب للطالب' : modal.reset ? 'إعادة تعيين كلمة المرور' : modal.rename ? 'تعديل اسم المستخدم' : 'حذف حساب الطالب'}
          onClose={() => setModal(null)}
        >
          {modal.creds && (
            <>
              <div className="alert">احفظ هذه البيانات الآن وسلّمها للطالب أو وليّ أمره. كلمة المرور لن تظهر مرة أخرى.</div>
              <div className="pre" style={{ fontSize: 17 }}>{`اسم المستخدم: ${modal.creds.username}\nكلمة المرور المؤقتة: ${modal.creds.password}`}</div>
              <button className="btn block" style={{ marginTop: 10 }} onClick={() => copy(modal.creds)}>{copied ? 'تم النسخ ✓' : 'نسخ البيانات مع رابط الدخول'}</button>
            </>
          )}

          {modal.create && (
            <form onSubmit={(e) => { e.preventDefault(); run(() => api(base, { method: 'POST', body: modal.create.username ? { username: modal.create.username } : {} }), null, showCreds); }}>
              <label>اسم المستخدم (اتركه فارغاً ليُولَّد تلقائياً)
                <input dir="ltr" placeholder="مثال: st123456" value={modal.create.username} onChange={(e) => setModal({ create: { username: e.target.value } })} />
              </label>
              <p className="small muted">حروف إنجليزية وأرقام فقط. تُولَّد كلمة مرور مؤقتة تظهر مرة واحدة، ويُطلب من الطالب تغييرها عند أول دخول.</p>
              <button className="btn block" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء'}</button>
            </form>
          )}

          {modal.reset && (
            <>
              <p className="small muted">ستُنشأ كلمة مرور مؤقتة جديدة وتبطل الحالية، ويُطلب من الطالب تغييرها عند دخوله.</p>
              <button className="btn block" disabled={busy} onClick={() => run(() => api(base + '/reset-password', { method: 'POST' }), null, showCreds)}>{busy ? 'جارٍ الإنشاء…' : 'تأكيد وإنشاء كلمة جديدة'}</button>
            </>
          )}

          {modal.rename && (
            <form onSubmit={(e) => { e.preventDefault(); run(() => api(base, { method: 'PATCH', body: { username: modal.rename.username } }), 'تم تعديل اسم المستخدم'); }}>
              <label>اسم المستخدم<input dir="ltr" value={modal.rename.username} onChange={(e) => setModal({ rename: { username: e.target.value } })} required /></label>
              <button className="btn block" disabled={busy}>حفظ</button>
            </form>
          )}

          {modal.del && (
            <>
              <p className="small muted">سيُحذف حساب الدخول فقط ولا يتأثر الطالب ولا سجلاته. يمكنك إنشاء حساب جديد لاحقاً.</p>
              <button className="btn block danger" disabled={busy} onClick={() => run(() => api(base, { method: 'DELETE' }), 'تم حذف الحساب')}>تأكيد الحذف</button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
