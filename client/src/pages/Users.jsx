import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, IconBtn, Loading, Modal, ROLE_AR, initial, qs, useFlash } from '../ui.jsx';

const empty = { name: '', username: '', phone: '', password: '', role: 'supervisor' };

// صفحة المشرفين ومديري النظام (المعلمون لهم صفحتهم الخاصة)
export default function Users({ me, online, query }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const role = query.role === 'admin' ? 'admin' : 'supervisor';

  const load = useCallback(async () => {
    try { setItems((await api('/users' + qs({ limit: 50, q, role }))).items); } catch (e) { flash.err(e); }
  }, [q, role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function run(fn, okText) {
    setBusy(true); flash.clear();
    try { await fn(); flash.ok(okText); await load(); return true; } catch (e) { flash.err(e); return false; } finally { setBusy(false); }
  }
  const set = (setter) => (k) => (e) => setter((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (u) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`إيقاف حساب ${u.name}؟`)) return;
    run(() => api(`/users/${u.id}/status`, { method: 'POST', body: { status: next } }), next === 'active' ? 'تمت إعادة التنشيط' : 'تم إيقاف الحساب');
  };
  const reset = (u) => { const p = prompt(`كلمة مرور جديدة لـ ${u.name} (6 أحرف على الأقل، حروف إنجليزية وأرقام)`); if (p) run(() => api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password: p } }), 'تم تعيين كلمة المرور'); };

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو اسم المستخدم" value={q} onChange={(e) => setQ(e.target.value)} />
        <IconBtn icon="plus" tone="on" caption="مشرف" label="إضافة مشرف" disabled={!online} onClick={() => setForm({ ...empty })} />
      </div>
      <div className="chips">
        <a className={'chip' + (role === 'supervisor' ? ' on' : '')} href="#/users">المشرفون</a>
        <a className={'chip' + (role === 'admin' ? ' on' : '')} href="#/users?role=admin">مديرو النظام</a>
      </div>
      {flash.node}
      {items === null && <Loading />}
      {items?.length === 0 && <Empty text="لا توجد نتائج" />}
      {items?.map((u) => (
        <div className="card tcard" key={u.id}>
          <div className="sc-head">
            <div className="avatar">{initial(u.name)}</div>
            <b className="name">{u.name}</b>
            <span className={'tag ' + (u.status === 'active' ? 'ok' : 'bad')}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
          </div>
          <div className="metas"><span className="m">{ROLE_AR[u.role]}</span><span className="m" dir="ltr">@{u.username}</span>{u.phone && <span className="m" dir="ltr">+{u.phone}</span>}</div>
          <div className="irow">
            {u.whatsapp && <IconBtn icon="chat" tone="wa" label="واتساب" href={u.whatsapp} />}
            <IconBtn icon="edit" label="تعديل" disabled={!online} onClick={() => setEdit({ ...u })} />
            <IconBtn icon="key" label="تغيير كلمة المرور" disabled={!online} onClick={() => reset(u)} />
            {u.id !== me.id && <IconBtn icon="power" tone={u.status === 'active' ? 'danger' : 'ok'} label={u.status === 'active' ? 'إيقاف' : 'تنشيط'} disabled={!online || busy} onClick={() => toggle(u)} />}
          </div>
        </div>
      ))}
      {form && (
        <Modal title="مشرف جديد" onClose={() => setForm(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/users', { method: 'POST', body: form }), 'تم إنشاء الحساب')) setForm(null); }}>
            <label>الاسم<input value={form.name} onChange={set(setForm)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={form.username} onChange={set(setForm)('username')} required /></label>
            <label>رقم الجوال (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set(setForm)('phone')} /></label>
            <label>كلمة المرور (6 أحرف على الأقل، حروف وأرقام)<input dir="ltr" type="password" minLength={6} value={form.password} onChange={set(setForm)('password')} required /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="تعديل الحساب" onClose={() => setEdit(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); const { id, name, username, phone } = edit; if (await run(() => api('/users/' + id, { method: 'PATCH', body: { name, username, phone } }), 'تم حفظ التعديل')) setEdit(null); }}>
            <label>الاسم<input value={edit.name} onChange={set(setEdit)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={edit.username} onChange={set(setEdit)('username')} required /></label>
            <label>رقم الجوال<input dir="ltr" inputMode="tel" value={edit.phone} onChange={set(setEdit)('phone')} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
