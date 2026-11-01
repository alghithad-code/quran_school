import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, Loading, Modal, ROLE_AR, go, qs, useFlash } from '../ui.jsx';

const empty = { name: '', username: '', phone: '', password: '', role: 'teacher' };

export default function Users({ me, online, query }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(null);
  const [lv, setLv] = useState(null); // ربط المستويات
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const isAdmin = me.role === 'admin';

  const load = useCallback(async () => {
    try {
      setItems((await api('/users' + qs({ limit: 50, q, role: query.role, status: query.status }))).items);
    } catch (e) { flash.err(e); }
  }, [q, query.role, query.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function run(fn, okText) {
    setBusy(true); flash.clear();
    try { await fn(); flash.ok(okText); await load(); return true; } catch (e) { flash.err(e); return false; } finally { setBusy(false); }
  }
  const set = (setter) => (k) => (e) => setter((s) => ({ ...s, [k]: e.target.value }));

  const create = async (e) => { e.preventDefault(); if (await run(() => api('/users', { method: 'POST', body: form }), 'تم إنشاء الحساب')) setForm(null); };
  const save = async (e) => { e.preventDefault(); const { id, name, username, phone } = edit; if (await run(() => api('/users/' + id, { method: 'PATCH', body: { name, username, phone } }), 'تم حفظ التعديل')) setEdit(null); };
  const toggle = (u) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`إيقاف حساب ${u.name}؟ ستبقى كل بياناته وطلابه.`)) return;
    run(() => api(`/users/${u.id}/status`, { method: 'POST', body: { status: next } }), next === 'active' ? 'تمت إعادة التنشيط' : 'تم إيقاف الحساب');
  };
  const reset = (u) => { const p = prompt(`كلمة مرور جديدة لـ ${u.name} (6 أحرف على الأقل، حروف إنجليزية وأرقام)`); if (p) run(() => api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password: p } }), 'تم تعيين كلمة المرور'); };

  async function openLevels(u) {
    try {
      const d = await api('/levels');
      setLv({ user: u, levels: d.items, picked: new Set(d.items.filter((l) => l.teachers.some((t) => String(t.id) === u.id)).map((l) => String(l.id))) });
    } catch (e) { flash.err(e); }
  }
  async function saveLevels() {
    if (await run(() => api('/levels/teacher/' + lv.user.id, { method: 'PUT', body: { levelIds: [...lv.picked] } }), 'تم ربط المستويات')) setLv(null);
  }

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو اسم المستخدم أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!online} onClick={() => setForm({ ...empty })}>+ إضافة</button>
      </div>
      {(query.role || query.status) && <div className="chips"><a className="chip on" href="#/users">إلغاء الفلتر ✕</a></div>}
      {flash.node}
      {items === null && <Loading />}
      {items?.length === 0 && <Empty text="لا توجد نتائج" />}
      {items?.map((u) => (
        <div className="card item" key={u.id}>
          <div className="row between">
            <strong>{u.name}</strong>
            <span className={'tag ' + (u.status === 'active' ? 'ok' : 'bad')}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
          </div>
          <div className="muted small" dir="ltr" style={{ textAlign: 'right' }}>@{u.username} {u.phone && `· +${u.phone}`}</div>
          {isAdmin && <div className="muted small">{ROLE_AR[u.role]}</div>}
          <div className="row wrap">
            {u.whatsapp && <a className="btn ghost" href={u.whatsapp} target="_blank" rel="noreferrer">واتساب</a>}
            {u.role === 'teacher' && <button className="btn ghost" onClick={() => go('/students' + qs({ teacherId: u.id }))}>عرض الطلاب</button>}
            {u.role === 'teacher' && <button className="btn ghost" onClick={() => go('/reports' + qs({ type: 'teacher', id: u.id }))}>إحصائيات</button>}
            {u.role === 'teacher' && <button className="btn ghost" disabled={!online} onClick={() => openLevels(u)}>المستويات</button>}
            <button className="btn ghost" disabled={!online} onClick={() => setEdit({ ...u })}>تعديل</button>
            <button className="btn ghost" disabled={!online} onClick={() => reset(u)}>كلمة المرور</button>
            {u.id !== me.id && <button className="btn ghost danger" disabled={!online || busy} onClick={() => toggle(u)}>{u.status === 'active' ? 'إيقاف' : 'تنشيط'}</button>}
          </div>
        </div>
      ))}

      {form && (
        <Modal title="حساب جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            {isAdmin && <label>النوع<select value={form.role} onChange={set(setForm)('role')}><option value="teacher">معلم</option><option value="supervisor">مشرف</option></select></label>}
            <label>الاسم<input value={form.name} onChange={set(setForm)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={form.username} onChange={set(setForm)('username')} required /></label>
            <label>رقم الجوال (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set(setForm)('phone')} /></label>
            <label>كلمة المرور (6 أحرف على الأقل، حروف وأرقام)<input dir="ltr" type="password" minLength={6} title="6 أحرف على الأقل، حروف إنجليزية وأرقام" value={form.password} onChange={set(setForm)('password')} required /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="تعديل الحساب" onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <label>الاسم<input value={edit.name} onChange={set(setEdit)('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={edit.username} onChange={set(setEdit)('username')} required /></label>
            <label>رقم الجوال<input dir="ltr" inputMode="tel" value={edit.phone} onChange={set(setEdit)('phone')} /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
      {lv && (
        <Modal title={`مستويات ${lv.user.name}`} onClose={() => setLv(null)}>
          {lv.levels.length === 0 && <Empty text="أنشئ المستويات أولاً من صفحة المستويات" />}
          {lv.levels.map((l) => (
            <label key={l.id} className="check">
              <input type="checkbox" checked={lv.picked.has(String(l.id))} onChange={(e) => { const p = new Set(lv.picked); e.target.checked ? p.add(String(l.id)) : p.delete(String(l.id)); setLv({ ...lv, picked: p }); }} />
              {l.name}
            </label>
          ))}
          <button className="btn block" disabled={busy} onClick={saveLevels}>حفظ</button>
        </Modal>
      )}
    </div>
  );
}
