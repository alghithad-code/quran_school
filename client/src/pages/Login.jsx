import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin, online }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onLogin(await api('/auth/login', { method: 'POST', body: { username, password } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>مدرسة التحفيظ</h1>
        <p className="muted">تسجيل الدخول</p>
        {!online && <div className="alert">لا يوجد اتصال بالإنترنت</div>}
        <label>اسم المستخدم
          <input dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>كلمة المرور
          <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn" disabled={busy || !online}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </div>
  );
}
