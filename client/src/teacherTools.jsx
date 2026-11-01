import { useState } from 'react';
import { api } from './api.js';
import { Empty, IconBtn, Modal } from './ui.jsx';

// أدوات المعلم المشتركة بين قائمة المعلمين وصفحة المعلم: أزرار الأيقونات والنوافذ
export function useTeacherTools({ online, flash, onChanged }) {
  const [edit, setEdit] = useState(null);
  const [lv, setLv] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(fn, ok) {
    setBusy(true); flash.clear();
    try { await fn(); flash.ok(ok); onChanged(); return true; } catch (e) { flash.err(e); return false; } finally { setBusy(false); }
  }
  const toggle = (u) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`إيقاف حساب ${u.name}؟ ستبقى كل بياناته وطلابه.`)) return;
    run(() => api(`/users/${u.id}/status`, { method: 'POST', body: { status: next } }), next === 'active' ? 'تمت إعادة التنشيط' : 'تم إيقاف الحساب');
  };
  const reset = (u) => {
    const p = prompt(`كلمة مرور جديدة لـ ${u.name} (6 أحرف على الأقل، حروف إنجليزية وأرقام)`);
    if (p) run(() => api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password: p } }), 'تم تعيين كلمة المرور');
  };
  async function openLevels(u) {
    try {
      const d = await api('/levels');
      setLv({ user: u, levels: d.items, picked: new Set(d.items.filter((l) => l.teachers.some((t) => String(t.id) === u.id)).map((l) => String(l.id))) });
    } catch (e) { flash.err(e); }
  }

  // صف الأزرار: يُصفّ بجوار بعضه
  const buttons = (u, { link = true } = {}) => (
    <div className="irow">
      {u.whatsapp && <IconBtn icon="chat" tone="wa" label="واتساب" href={u.whatsapp} />}
      {link && <IconBtn icon="users" label="طلاب المعلم" href={'#/teachers/' + u.id} />}
      <IconBtn icon="edit" label="تعديل البيانات" disabled={!online} onClick={() => setEdit({ ...u })} />
      <IconBtn icon="layers" label="تحديد مستويات المعلم" disabled={!online} onClick={() => openLevels(u)} />
      <IconBtn icon="chart" tone="gold" label="تقرير المعلم" href={'#/reports?type=teacher&id=' + u.id} />
      <IconBtn icon="key" label="تغيير كلمة المرور" disabled={!online} onClick={() => reset(u)} />
      <IconBtn icon="power" tone={u.status === 'active' ? 'danger' : 'ok'} label={u.status === 'active' ? 'إيقاف الحساب' : 'تنشيط الحساب'} disabled={!online || busy} onClick={() => toggle(u)} />
    </div>
  );

  const modals = (
    <>
      {edit && (
        <Modal title="تعديل بيانات المعلم" onClose={() => setEdit(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); const { id, name, username, phone } = edit; if (await run(() => api('/users/' + id, { method: 'PATCH', body: { name, username, phone } }), 'تم حفظ التعديل')) setEdit(null); }}>
            <label>الاسم<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} required /></label>
            <label>رقم الجوال<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
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
          <button className="btn block" disabled={busy} onClick={async () => { if (await run(() => api('/levels/teacher/' + lv.user.id, { method: 'PUT', body: { levelIds: [...lv.picked] } }), 'تم حفظ المستويات')) setLv(null); }}>حفظ</button>
        </Modal>
      )}
    </>
  );
  return { buttons, modals, busy };
}
