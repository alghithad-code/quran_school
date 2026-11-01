import { api } from '../api.js';
import { Empty, Loading, fmtDT, go, linkTo, useFlash, useLoad } from '../ui.jsx';

export default function Notifications({ onChange }) {
  const { data, loading, reload } = useLoad(() => api('/notifications'), []);
  const flash = useFlash();

  async function open(n) {
    try { if (!n.read) { await api(`/notifications/${n.id}/read`, { method: 'POST' }); onChange(); } } catch { /* لا يمنع الانتقال */ }
    if (n.link) go(n.link);
  }
  async function readAll() {
    try { await api('/notifications/read-all', { method: 'POST' }); await reload(); onChange(); } catch (e) { flash.err(e); }
  }
  if (loading) return <Loading />;
  return (
    <div>
      <div className="row between"><h2 className="h" style={{ margin: 0 }}>الإشعارات</h2>{data?.unread > 0 && <button className="btn ghost" onClick={readAll}>تحديد الكل كمقروء</button>}</div>
      {flash.node}
      {data?.items.length === 0 && <Empty text="لا توجد إشعارات" />}
      {data?.items.map((n) => (
        <button key={n.id} className={'card notif' + (n.read ? '' : ' unread')} onClick={() => open(n)}>
          <b>{n.title}</b>
          <span className="small">{n.body}</span>
          <small className="muted">{fmtDT(n.at)}</small>
        </button>
      ))}
    </div>
  );
}
