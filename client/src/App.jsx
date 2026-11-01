import { useCallback, useEffect, useState } from 'react';
import { api, setCsrf } from './api.js';
import { Icon, Logo, ROLE_AR, SettingsCtx, go, useRoute } from './ui.jsx';
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

const TITLES = { '': 'الرئيسية', students: 'الطلاب', users: 'المستخدمون', levels: 'المستويات', promotions: 'طلبات الترقية', reports: 'التقارير', notifications: 'الإشعارات', audit: 'سجل العمليات', admin: 'الإعدادات والنسخ', more: 'حسابي' };

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [settings, setSettings] = useState({ gradeScale: [], absenceThreshold: 3 });
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const { path, query } = useRoute();

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => { setOpen(false); }, [path]);

  const loadSession = useCallback((u) => { setUser(u); api('/settings').then(setSettings).catch(() => {}); }, []);
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
  const key = seg[0] || '';
  let page;
  switch (key) {
    case 'students': page = seg[1] ? <StudentDetail key={seg[1]} id={seg[1]} me={user} online={online} /> : <Students me={user} online={online} query={query} />; break;
    case 'users': page = isManager ? <Users me={user} online={online} query={query} /> : <Home user={user} />; break;
    case 'levels': page = isManager ? <Levels online={online} /> : <Home user={user} />; break;
    case 'promotions': page = <Promotions me={user} online={online} />; break;
    case 'reports': page = <Reports me={user} query={query} />; break;
    case 'notifications': page = <Notifications onChange={refreshUnread} />; break;
    case 'audit': page = isManager ? <Audit /> : <Home user={user} />; break;
    case 'admin': page = user.role === 'admin' ? <Admin online={online} /> : <Home user={user} />; break;
    case 'more': page = <More online={online} onLogout={logout} />; break;
    default: page = <Home user={user} />;
  }

  const items = [
    ['', 'home', 'الرئيسية'],
    ['students', 'users', 'الطلاب'],
    isManager && ['users', 'user', user.role === 'admin' ? 'المستخدمون' : 'المعلمون'],
    isManager && ['levels', 'layers', 'المستويات'],
    ['promotions', 'up', 'طلبات الترقية'],
    ['reports', 'chart', 'التقارير'],
    ['notifications', 'bell', 'الإشعارات'],
    isManager && ['audit', 'shield', 'سجل العمليات'],
    user.role === 'admin' && ['admin', 'sliders', 'الإعدادات والنسخ'],
    ['more', 'lock', 'حسابي وكلمة المرور'],
  ].filter(Boolean);

  return (
    <SettingsCtx.Provider value={settings}>
      <div className="shell">
        <aside className={'side noprint' + (open ? ' open' : '')}>
          <div className="brand"><Logo size={44} /><div><b>مدرسة التحفيظ</b><small>إدارة حلقات القرآن الكريم</small></div></div>
          <nav className="menu">
            {items.map(([k, icon, label]) => (
              <a key={k} href={'#/' + k} className={'mi' + (key === k ? ' on' : '')}>
                <Icon name={icon} /><span>{label}</span>
                {k === 'notifications' && unread > 0 && <i className="badge">{unread > 99 ? '99+' : unread}</i>}
              </a>
            ))}
          </nav>
          <div className="who"><b>{user.name}</b><small>{ROLE_AR[user.role]}</small></div>
          <button className="mi out" onClick={logout}><Icon name="logout" /><span>تسجيل الخروج</span></button>
        </aside>
        {open && <div className="scrim noprint" onClick={() => setOpen(false)} />}

        <div className="main">
          {!online && <div className="offline noprint">لا يوجد اتصال بالإنترنت — الحفظ والتعديل متوقفان حتى عودة الاتصال</div>}
          <header className="top noprint">
            <button className="iconbtn burger" aria-label="القائمة" onClick={() => setOpen(true)}><Icon name="menu" /></button>
            <div className="title">{TITLES[key]}</div>
            <button className="iconbtn" aria-label="الإشعارات" onClick={() => go('/notifications')}>
              <Icon name="bell" />{unread > 0 && <i className="badge dot">{unread > 99 ? '99+' : unread}</i>}
            </button>
          </header>
          <main className="content">{page}</main>
          <nav className="bottom noprint">
            <button className={key === '' ? 'on' : ''} onClick={() => go('/')}><Icon name="home" /><span>الرئيسية</span></button>
            <button className={key === 'students' ? 'on' : ''} onClick={() => go('/students')}><Icon name="users" /><span>الطلاب</span></button>
            <button className={key === 'notifications' ? 'on' : ''} onClick={() => go('/notifications')}><Icon name="bell" /><span>الإشعارات</span>{unread > 0 && <i className="badge">{unread > 99 ? '99+' : unread}</i>}</button>
            <button onClick={() => setOpen(true)}><Icon name="menu" /><span>القائمة</span></button>
          </nav>
        </div>
      </div>
    </SettingsCtx.Provider>
  );
}
