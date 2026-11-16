import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, PasswordInput, useFlash } from '../ui.jsx';

const USERNAME_RX = /^[a-z0-9._-]{3,40}$/;

// تعديل بيانات الحساب الشخصي (اسم المستخدم وكلمة المرور) للطالب والمعلم وغيرهما: لحساب المستخدم الحالي فقط
export default function More({ online, onLogout }) {
  const [username, setUsername] = useState('');
  const [un, setUn] = useState({ username: '', currentPassword: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busyU, setBusyU] = useState(false);
  const [busyP, setBusyP] = useState(false);
  const flash = useFlash();

  useEffect(() => { api('/auth/me').then((d) => setUsername(d.user.username)).catch(() => {}); }, []);

  async function changeUsername(e) {
    e.preventDefault();
    if (busyU) return;
    const next = un.username.trim().toLowerCase();
    if (!USERNAME_RX.test(next)) return flash.err(new Error('اسم المستخدم: 3-40 حرفاً إنجليزياً أو أرقاماً أو . _ -'));
    if (next === username) return flash.err(new Error('اسم المستخدم الجديد مطابق للحالي'));
    setBusyU(true); flash.clear();
    try {
      const r = await api('/auth/change-username', { method: 'POST', body: { username: next, currentPassword: un.currentPassword } });
      setUsername(r.user.username); setUn({ username: '', currentPassword: '' });
      flash.ok(`تم تغيير اسم المستخدم إلى ${r.user.username}. استخدمه في الدخول القادم.`);
    } catch (er) { flash.err(er); } finally { setBusyU(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (busyP) return;
    if (pw.newPassword !== pw.confirmPassword) return flash.err(new Error('تأكيد كلمة المرور لا يطابق الجديدة'));
    setBusyP(true); flash.clear();
    try {
      await api('/auth/change-password', { method: 'POST', body: pw });
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      flash.ok('تم تغيير كلمة المرور. أُنهيت جلسات هذا الحساب على الأجهزة الأخرى.');
    } catch (er) { flash.err(er); } finally { setBusyP(false); }
  }

  return (
    <div>
      {flash.node}
      <div className="card">
        <h3><Icon name="user" size={20} /> تعديل بيانات الحساب</h3>
        <p className="small muted" style={{ marginTop: 0 }}>اسم المستخدم الحالي: <b dir="ltr">{username || '…'}</b></p>

        <form onSubmit={changeUsername}>
          <h4 style={{ margin: '8px 0' }}>تغيير اسم المستخدم</h4>
          <label>اسم المستخدم الجديد<input dir="ltr" autoComplete="off" autoCapitalize="none" placeholder="3-40 حرفاً إنجليزياً أو أرقاماً أو . _ -" value={un.username} onChange={(e) => setUn({ ...un, username: e.target.value })} required /></label>
          <label>كلمة المرور الحالية (للتأكيد)<PasswordInput autoComplete="current-password" value={un.currentPassword} onChange={(e) => setUn({ ...un, currentPassword: e.target.value })} required /></label>
          <button className="btn block" disabled={busyU || !online}>{busyU ? 'جارٍ الحفظ…' : 'حفظ اسم المستخدم'}</button>
        </form>

        <hr style={{ border: 0, borderTop: '1px solid var(--bd)', margin: '16px 0' }} />

        <form onSubmit={changePassword}>
          <h4 style={{ margin: '8px 0' }}><Icon name="lock" size={18} /> تغيير كلمة المرور</h4>
          <label>الحالية<PasswordInput autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
          <label>الجديدة (6 أحرف على الأقل، حروف إنجليزية وأرقام)<PasswordInput autoComplete="new-password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
          <label>تأكيد كلمة المرور الجديدة<PasswordInput autoComplete="new-password" minLength={6} value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} required /></label>
          <button className="btn block" disabled={busyP || !online}>{busyP ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</button>
        </form>
      </div>
      <button className="btn ghost danger block" onClick={onLogout}><Icon name="logout" size={20} /> تسجيل الخروج</button>
    </div>
  );
}
