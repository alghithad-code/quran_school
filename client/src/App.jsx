import { useEffect, useState } from 'react';
import { api, setCsrf } from './api.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Users from './pages/Users.jsx';

const ROLE_AR = { admin: 'مدير النظام', supervisor: 'مشرف', teacher: 'معلم' };

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('home');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    api('/auth/me')
      .then((d) => {
        setCsrf(d.csrfToken);
        setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    setCsrf('');
    setUser(null);
    setTab('home');
  }

  if (!ready) return <div className="center muted">جارٍ التحميل…</div>;
  if (!user) return <Login onLogin={(d) => { setCsrf(d.csrfToken); setUser(d.user); }} online={online} />;

  const isManager = user.role === 'admin' || user.role === 'supervisor';

  return (
    <div className="app">
      {!online && <div className="offline">لا يوجد اتصال بالإنترنت — الحفظ والتعديل متوقفان حتى عودة الاتصال</div>}
      <header className="top">
        <div>
          <strong>{user.name}</strong>
          <span className="muted small"> · {ROLE_AR[user.role]}</span>
        </div>
        <button className="btn ghost" onClick={logout}>خروج</button>
      </header>
      <main className="content">
        {tab === 'home' && <Home user={user} />}
        {tab === 'users' && isManager && <Users me={user} online={online} />}
      </main>
      <nav className="bottom">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>الرئيسية</button>
        {isManager && (
          <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>
            {user.role === 'admin' ? 'المستخدمون' : 'المعلمون'}
          </button>
        )}
      </nav>
    </div>
  );
}
