import { useState } from 'react';
import { api } from '../api.js';
import { Icon, useFlash } from '../ui.jsx';

export default function More({ online, onLogout }) {
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  async function change(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: pw }); flash.ok('تم تغيير كلمة المرور'); setPw({ currentPassword: '', newPassword: '' }); } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  return (
    <div>
      {flash.node}
      <form className="card" onSubmit={change}>
        <h3><Icon name="lock" size={20} /> تغيير كلمة المرور</h3>
        <label>الحالية<input dir="ltr" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
        <label>الجديدة (6 أحرف على الأقل، حروف إنجليزية وأرقام)<input dir="ltr" type="password" autoComplete="new-password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
        <button className="btn block" disabled={busy || !online}>حفظ</button>
      </form>
      <button className="btn ghost danger block" onClick={onLogout}><Icon name="logout" size={20} /> تسجيل الخروج</button>
    </div>
  );
}
