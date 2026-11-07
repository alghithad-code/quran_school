import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Logo, PasswordInput, go } from '../ui.jsx';
import More from './More.jsx';
import Mushaf from './Mushaf.jsx';
import StudentPortal from './StudentPortal.jsx';

const TITLES = { '': 'صفحتي', mushaf: 'المصحف الشريف', more: 'حسابي وكلمة المرور' };

// الكلمة المؤقتة التي سلّمها المعلم: لا يدخل الطالب صفحته قبل أن يختار كلمته الخاصة
function ForcePassword({ user, online, onDone, onLogout }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/auth/change-password', { method: 'POST', body: f }); onDone((await api('/auth/me')).user); } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }
  return (
    <div className="login">
      <div className="hero"><Logo size={90} /><div className="bismillah">بسم الله الرحمن الرحيم</div></div>
      <form className="card" onSubmit={submit}>
        <h1>أهلاً {user.name}</h1>
        <p className="muted">كلمة المرور الحالية مؤقتة. اختر كلمة مرور خاصة بك لتبدأ.</p>
        {!online && <div className="alert">لا يوجد اتصال بالإنترنت</div>}
        <label>كلمة المرور المؤقتة<PasswordInput autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required /></label>
        <label>كلمتك الجديدة (6 أحرف على الأقل، حروف إنجليزية وأرقام)<PasswordInput autoComplete="new-password" minLength={6} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn block" disabled={busy || !online}>{busy ? 'جارٍ الحفظ…' : 'حفظ والدخول'}</button>
      </form>
      <button className="btn ghost block" style={{ maxWidth: 400, margin: '0 auto' }} onClick={onLogout}><Icon name="logout" size={20} /> تسجيل الخروج</button>
    </div>
  );
}

// واجهة الطالب: صفحتي، المصحف، وكلمة المرور فقط (لا قوائم الإدارة ولا الإشعارات)
export default function StudentApp({ user, setUser, online, path, onLogout }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);

  if (user.mustChangePassword) return <ForcePassword user={user} online={online} onDone={setUser} onLogout={onLogout} />;

  const key = path.split('/').filter(Boolean)[0] || '';
  const k = key in TITLES ? key : '';
  const page = k === 'mushaf' ? <Mushaf authed online={online} /> : k === 'more' ? <More online={online} onLogout={onLogout} /> : <StudentPortal />;
  const items = [['', 'home', 'صفحتي'], ['mushaf', 'bookopen', 'المصحف الشريف'], ['more', 'lock', 'حسابي وكلمة المرور']];

  return (
    <div className="shell">
      <aside className={'side noprint' + (open ? ' open' : '')}>
        <div className="brand"><Logo size={44} /><div><b>مجتمع بالقرآن نحيا</b><small>صفحة الطالب</small></div></div>
        <nav className="menu">
          {items.map(([p, icon, label]) => <a key={p} href={'#/' + p} className={'mi' + (k === p ? ' on' : '')}><Icon name={icon} /><span>{label}</span></a>)}
        </nav>
        <div className="who"><b>{user.name}</b><small>طالب</small></div>
        <button className="mi out" onClick={onLogout}><Icon name="logout" /><span>تسجيل الخروج</span></button>
      </aside>
      {open && <div className="scrim noprint" onClick={() => setOpen(false)} />}
      <div className="main">
        {!online && <div className="offline noprint">لا يوجد اتصال بالإنترنت</div>}
        <header className="top noprint">
          <button className="iconbtn burger" aria-label="القائمة" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <div className="title">{TITLES[k]}</div>
          <span style={{ width: 44 }} />
        </header>
        <main className="content">{page}</main>
        <nav className="bottom noprint">
          <button className={k === '' ? 'on' : ''} onClick={() => go('/')}><Icon name="home" /><span>صفحتي</span></button>
          <button className={k === 'mushaf' ? 'on' : ''} onClick={() => go('/mushaf')}><Icon name="bookopen" /><span>المصحف</span></button>
          <button className={k === 'more' ? 'on' : ''} onClick={() => go('/more')}><Icon name="lock" /><span>حسابي</span></button>
        </nav>
      </div>
    </div>
  );
}
