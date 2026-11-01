import { useCallback, useEffect, useState } from 'react';
import { api, setCsrf } from './api.js';
import { ROLE_AR, SettingsCtx, go, useRoute } from './ui.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Users from './pages/Users.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Levels from './pages/Levels.jsx';
import Promotions from './pages/Promotions.jsx';
import Reports from './pages/Reports.jsx';
import Notifications from './pages/Notifications.jsx';
import Audit from './pages/Audit.jsx';
import Admin from './pages/Admin.jsx';
import More from './pages/More.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [settings, setSettings] = useState({ gradeScale: [], absenceThreshold: 3 });
  const [unread, setUnread] = useState(0);
  const { path, query } = useRoute();

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const loadSession = useCallback((u) => {
    setUser(u);
    api('/settings').then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    api('/auth/me').then((d) => { setCsrf(d.csrfToken); loadSession(d.user); }).catch(() => {}).finally(() => setReady(true));
  }, [loadSession]);

  const refreshUnread = useCallback(() => { api('/notifications/count').then((d) => setUnread(d.unread)).catch((e) => { if (e.status === 401) setUser(null); }); }, []);
  useEffect(() => {
    if (!user) return undefined;
    refreshUnread();
    const t = setInterval(refreshUnread, 60000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* تنتهي الجلسة محلياً على أي حال */ }
    setCsrf(''); setUser(null); window.location.hash = '#/';
  }

  if (!ready) return <div className="center muted">جارٍ التحميل…</div>;
  if (!user) return <Login onLogin={(d) => { setCsrf(d.csrfToken); loadSession(d.user); }} online={online} />;

  const isManager = user.role !== 'teacher';
  const seg = path.split('/').filter(Boolean);
  let page;
  switch (seg[0]) {
    case 'students': page = seg[1] ? <StudentDetail key={seg[1]} id={seg[1]} me={user} online={online} /> : <Students me={user} online={online} query={query} />; break;
    case 'users': page = isManager ? <Users me={user} online={online} query={query} /> : <Home user={user} />; break;
    case 'levels': page = isManager ? <Levels online={online} /> : <Home user={user} />; break;
    case 'promotions': page = <Promotions me={user} online={online} />; break;
    case 'reports': page = <Reports me={user} query={query} />; break;
    case 'notifications': page = <Notifications onChange={refreshUnread} />; break;
    case 'audit': page = isManager ? <Audit /> : <Home user={user} />; break;
    case 'admin': page = user.role === 'admin' ? <Admin online={online} /> : <Home user={user} />; break;
    case 'more': page = <More user={user} online={online} onLogout={logout} />; break;
    default: page = <Home user={user} />;
  }
  const on = (k) => (seg[0] === k || (!seg[0] && k === '') ? 'on' : '');

  return (
    <SettingsCtx.Provider value={settings}>
      <div className="app">
        {!online && <div className="offline noprint">لا يوجد اتصال بالإنترنت — الحفظ والتعديل متوقفان حتى عودة الاتصال</div>}
        <header className="top noprint">
          <div><strong>{user.name}</strong><span className="muted small"> · {ROLE_AR[user.role]}</span></div>
          <button className="btn ghost" onClick={logout}>خروج</button>
        </header>
        <main className="content">{page}</main>
        <nav className="bottom noprint">
          <button className={on('')} onClick={() => go('/')}>الرئيسية</button>
          <button className={on('students')} onClick={() => go('/students')}>الطلاب</button>
          <button className={on('notifications')} onClick={() => go('/notifications')}>الإشعارات{unread > 0 && <i className="badge">{unread > 99 ? '99+' : unread}</i>}</button>
          <button className={on('more')} onClick={() => go('/more')}>المزيد</button>
        </nav>
      </div>
    </SettingsCtx.Provider>
  );
}
