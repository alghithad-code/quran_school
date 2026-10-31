import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = { name: '', username: '', phone: '', password: '', role: 'teacher' };

export default function Users({ me, online }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null); // نموذج الإنشاء
  const [edit, setEdit] = useState(null); // مستخدم قيد التعديل
  const [busy, setBusy] = useState(false);
  const isAdmin = me.role === 'admin';

  const load = useCallback(async () => {
    try {
      const d = await api('/users?limit=50&q=' + encodeURIComponent(q));
      setItems(d.items);
    } catch (e) {
      setMsg(e.message);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn, okText) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setMsg(okText); // لا تظهر رسالة النجاح إلا بعد تأكيد الخادم
      await load();
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const create = async (e) => {
    e.preventDefault();
    if (await run(() => api('/users', { method: 'POST', body: form }), 'تم إنشاء الحساب')) setForm(null);
  };
  const save = async (e) => {
    e.preventDefault();
    const { id, name, username, phone } = edit;
    if (await run(() => api('/users/' + id, { method: 'PATCH', body: { name, username, phone } }), 'تم حفظ التعديل')) setEdit(null);
  };
  const toggle = (u) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`إيقاف حساب ${u.name}؟`)) return;
    run(() => api(`/users/${u.id}/status`, { method: 'POST', body: { status: next } }), next === 'active' ? 'تمت إعادة التنشيط' : 'تم إيقاف الحساب');
  };
  const reset = (u) => {
    const p = prompt(`كلمة مرور جديدة لـ ${u.name} (8 أحرف على الأقل)`);
    if (p) run(() => api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password: p } }), 'تم تعيين كلمة المرور');
  };

  const set = (setter) => (k) => (e) => setter((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو اسم المستخدم أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!online} onClick={() => setForm({ ...empty })}>+ إضافة</button>
      </div>
      {msg && <div className="alert" onClick={() => setMsg('')}>{msg}</div>}
      {items === null && <p className="muted center">جارٍ التحميل…</p>}
      {items && items.length === 0 && <p className="muted center">لا توجد نتائج</p>}
      {items?.map((u) => (
        <div className="card item" key={u.id}>
          <div className="row between">
            <strong>{u.name}</strong>
            <span className={'tag ' + (u.status === 'active' ? 'ok' : 'bad')}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
          </div>
          <div className="muted small" dir="ltr" style={{ textAlign: 'right' }}>@{u.username} {u.phone && `· +${u.phone}`}</div>
          {isAdmin && <div className="muted small">{{ admin: 'مدير نظام', supervisor: 'مشرف', teacher: 'معلم' }[u.role]}</div>}
          <div className="row wrap">
            {u.whatsapp && <a className="btn ghost" href={u.whatsapp} target="_blank" rel="noreferrer">واتساب</a>}
            <button className="btn ghost" disabled={!online} onClick={() => setEdit({ ...u })}>تعديل</button>
            <button className="btn ghost" disabled={!online} onClick={() => reset(u)}>كلمة المرور</button>
            {u.id !== me.id && (
              <button className="btn ghost danger" disabled={!online || busy} onClick={() => toggle(u)}>
                {u.status === 'active' ? 'إيقاف' : 'تنشيط'}
              </button>
            )}
          </div>
        </div>
      ))}

      {form && (
        <Modal title="حساب جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            {isAdmin && (
              <label>النوع
                <select value={form.role} onChange={set(setForm)('role')}>
                  <option value="teacher">معلم</option>
                  <option value="supervisor">مشرف</option>
                </select>
              </label>
            )}
            <label>الاسم<input value={form.name} onChange={set(setForm)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={form.username} onChange={set(setForm)('username')} required /></label>
            <label>رقم الجوال (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set(setForm)('phone')} /></label>
            <label>كلمة المرور<input dir="ltr" type="password" minLength={8} value={form.password} onChange={set(setForm)('password')} required /></label>
            <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="تعديل الحساب" onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <label>الاسم<input value={edit.name} onChange={set(setEdit)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={edit.username} onChange={set(setEdit)('username')} required /></label>
            <label>رقم الجوال<input dir="ltr" inputMode="tel" value={edit.phone} onChange={set(setEdit)('phone')} /></label>
            <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{title}</h3><button className="btn ghost" onClick={onClose}>إغلاق</button></div>
        {children}
      </div>
    </div>
  );
}
