import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { BackLink, Empty, ErrorBox, Icon, IconBtn, Loading, Modal, STATUS_AR, fmtDT, go, initial, useFlash, useLoad } from '../ui.jsx';
import { GroupForm } from './Groups.jsx';

function AddMembers({ groupId, existing, onDone, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api('/students?limit=40&q=' + encodeURIComponent(q)).then((d) => setList(d.items)).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  async function save() {
    setBusy(true); setErr('');
    try { await api(`/groups/${groupId}/members`, { method: 'POST', body: { add: [...sel] } }); onDone(sel.size); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="إضافة طلاب للمجموعة" onClose={onClose}>
      <input placeholder="ابحث باسم الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ margin: '10px 0', maxHeight: '45dvh', overflow: 'auto' }}>
        {list.map((s) => {
          const inGroup = existing.has(s.id);
          return (
            <label key={s.id} className="check" style={{ padding: '6px 0', opacity: inGroup ? 0.5 : 1 }}>
              <input type="checkbox" disabled={inGroup} checked={inGroup || sel.has(s.id)} onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })} />
              <span>{s.name}<small className="muted"> · {s.phone ? 'لديه رقم' : 'بلا رقم'}{inGroup ? ' · مضاف' : ''}</small></span>
            </label>
          );
        })}
      </div>
      {err && <div className="alert">{err}</div>}
      <button className="btn block" disabled={busy || !sel.size} onClick={save}>{busy ? 'جارٍ الإضافة…' : `إضافة (${sel.size})`}</button>
    </Modal>
  );
}

export default function GroupDetail({ id, online }) {
  const { data, loading, error, reload } = useLoad(() => api('/groups/' + id), [id]);
  const history = useLoad(() => api(`/groups/${id}/messages`), [id]);
  const [modal, setModal] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  if (loading) return <Loading />;
  if (error) return <div><ErrorBox text={error} /><BackLink fallback="/groups">رجوع</BackLink></div>;
  const g = data.group;
  const sample = data.members.find((m) => m.hasPhone && m.status === 'active')?.name || data.members[0]?.name || 'الطالب';
  const fill = (name) => text.replace(/\{الاسم\}/g, name).replace(/\{المجموعة\}/g, g.name);
  // لمجموعة واتساب موجودة: لا اسم خاص بكل عضو، فيُحذف {الاسم}
  const groupLink = 'https://wa.me/?text=' + encodeURIComponent(fill('').replace(/[ \t]{2,}/g, ' ').trim());
  const ready = text.trim().length > 0;

  async function prepare() {
    setBusy(true); flash.clear();
    try { const r = await api(`/groups/${id}/messages`, { method: 'POST', body: { text } }); go(`/groups/${id}/messages/${r.message.id}`); } catch (e) { flash.err(e); setBusy(false); }
  }
  async function remove(m) {
    if (!confirm(`إزالة ${m.name} من المجموعة؟`)) return;
    try { await api(`/groups/${id}/members`, { method: 'POST', body: { remove: [m.id] } }); flash.ok('تمت الإزالة'); reload(); } catch (e) { flash.err(e); }
  }
  async function del() {
    if (!confirm(`حذف المجموعة «${g.name}» وسجل رسائلها؟ لا تُحذف أي بيانات للطلاب.`)) return;
    try { await api('/groups/' + id, { method: 'DELETE' }); go('/groups'); } catch (e) { flash.err(e); }
  }

  return (
    <div>
      <BackLink fallback="/groups">‹ المجموعات</BackLink>
      <div className="card tcard">
        <div className="sc-head"><div className="avatar"><Icon name="grid" size={22} /></div><h2 className="h name" style={{ margin: 0 }}>{g.name}</h2></div>
        <div className="metas">
          <span className="m"><Icon name="users" size={14} />{g.studentCount} طالب</span>
          <span className="m"><Icon name="chat" size={14} />{g.withPhone} لديهم رقم</span>
          {g.studentCount > g.withPhone && <span className="tag warn">{g.studentCount - g.withPhone} بلا رقم (لن تصلهم الرسالة)</span>}
        </div>
        <div className="irow">
          <IconBtn icon="plus" tone="ok" caption="طلاب" label="إضافة طلاب" disabled={!online} onClick={() => setModal('add')} />
          <IconBtn icon="edit" label="تعديل الاسم" disabled={!online} onClick={() => setModal('edit')} />
          <IconBtn icon="trash" tone="danger" label="حذف المجموعة" disabled={!online} onClick={del} />
        </div>
      </div>
      {flash.node}

      <div className="card">
        <h3>رسالة جديدة</h3>
        <textarea className="msgbox" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="اكتب رسالتك هنا…" />
        <div className="row between" style={{ marginTop: 6 }}>
          <div className="irow">
            <button type="button" className="chip" onClick={() => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}{الاسم}`)}>+ اسم الطالب</button>
            <button type="button" className="chip" onClick={() => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}{المجموعة}`)}>+ اسم المجموعة</button>
          </div>
          <small className="muted">{text.length}/600</small>
        </div>
        {ready && (<>
          <p className="small muted" style={{ marginBottom: 4 }}>معاينة (كما ستصل إلى «{sample}»):</p>
          <div className="wa-preview">{fill(sample)}</div>
        </>)}
        <div className="irow" style={{ marginTop: 10 }}>
          <IconBtn icon="chat" tone="wa" caption="تجهيز رسائل الأعضاء" label="إنشاء الرسالة وتجهيز رابط واتساب لكل عضو" disabled={!online || busy || !ready || g.withPhone === 0} onClick={prepare} />
          <IconBtn icon="grid" tone="wa" caption="إلى مجموعة واتساب" label="فتح واتساب لاختيار مجموعة موجودة وإرسال النص إليها" href={ready ? groupLink : undefined} disabled={!ready} />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>«تجهيز رسائل الأعضاء» يفتح لك قائمة بكل عضو وزر واتساب بجانبه برسالة جاهزة باسمه، وتُتابع من أُرسل له. أما «إلى مجموعة واتساب» فتختار فيه مجموعة واتساب موجودة وتضغط إرسال (دون اسم خاص بكل عضو).</p>
      </div>

      <div className="card">
        <h3>الرسائل السابقة</h3>
        {history.loading && <Loading />}
        {history.data?.items.length === 0 && <Empty text="لم تُرسل رسائل بعد" />}
        {history.data?.items.map((m) => (
          <a key={m.id} className="line" href={`#/groups/${id}/messages/${m.id}`}>
            <span>{m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text}<br /><small className="muted">{fmtDT(m.at)} · {m.by}</small></span>
            <span className={'tag ' + (m.opened === m.total ? 'ok' : 'warn')}>{m.opened} / {m.total}</span>
          </a>
        ))}
      </div>

      <h3>الأعضاء</h3>
      {data.members.length === 0 && <Empty text="لا يوجد طلاب في المجموعة. أضفهم بزر «طلاب»." />}
      {data.members.map((m) => (
        <div className="card scard" key={m.id}>
          <div className="sc-head">
            <div className="avatar">{initial(m.name)}</div>
            <a className="name" href={'#/students/' + m.id}>{m.name}</a>
            {m.status !== 'active' && <span className="tag bad">{STATUS_AR[m.status]}</span>}
            {!m.hasPhone && <span className="tag warn">بلا رقم</span>}
          </div>
          <div className="metas">
            <span className="m"><Icon name="layers" size={14} />{m.level || 'بلا مستوى'}</span>
            {m.teacher && <span className="m"><Icon name="user" size={14} />{m.teacher}</span>}
          </div>
          <div className="irow">
            <IconBtn icon="file" label="ملف الطالب" href={'#/students/' + m.id} />
            <IconBtn icon="x" tone="danger" label="إزالة من المجموعة" disabled={!online} onClick={() => remove(m)} />
          </div>
        </div>
      ))}
      {modal === 'edit' && <GroupForm initial={{ id: g.id, name: g.name }} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('تم حفظ التعديل'); reload(); }} />}
      {modal === 'add' && <AddMembers groupId={id} existing={new Set(data.members.map((m) => m.id))} onClose={() => setModal(null)} onDone={(n) => { setModal(null); flash.ok(`تمت إضافة ${n} طالب`); reload(); }} />}
    </div>
  );
}
