import { useState } from 'react';
import { api } from '../api.js';
import { Modal, useFlash } from '../ui.jsx';

export default function More({ user, online, onLogout }) {
  const isManager = user.role !== 'teacher';
  const [pw, setPw] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  async function change(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: pw }); flash.ok('تم تغيير كلمة المرور'); setPw(null); } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  const L = ({ to, children }) => <a className="card line" href={'#' + to}>{children}<span className="muted">‹</span></a>;

  return (
    <div>
      <h2 className="h">المزيد</h2>
      {flash.node}
      {isManager && <L to="/users">{user.role === 'admin' ? 'المستخدمون' : 'المعلمون'}</L>}
      {isManager && <L to="/levels">المستويات</L>}
      <L to="/promotions">{isManager ? 'طلبات الترقية' : 'طلبات الترقية التي رفعتها'}</L>
      <L to="/reports">التقارير</L>
      {isManager && <L to="/audit">سجل العمليات</L>}
      {user.role === 'admin' && <L to="/admin">الإعدادات والنسخ الاحتياطي</L>}
      <button className="card line" style={{ width: '100%' }} disabled={!online} onClick={() => setPw({ currentPassword: '', newPassword: '' })}>تغيير كلمة المرور<span className="muted">‹</span></button>
      <button className="btn ghost danger block" onClick={onLogout}>تسجيل الخروج</button>
      {pw && (
        <Modal title="تغيير كلمة المرور" onClose={() => setPw(null)}>
          <form onSubmit={change}>
            <label>الحالية<input dir="ltr" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
            <label>الجديدة (8 أحرف على الأقل)<input dir="ltr" type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
