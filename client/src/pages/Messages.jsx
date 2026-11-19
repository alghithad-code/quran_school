import { useCallback, useEffect, useRef, useState } from 'react';
import { api, upload } from '../api.js';
import { Empty, ErrorBox, Icon, Loading, Modal, fmtDT, useFlash, useSettings } from '../ui.jsx';

const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.max(1, Math.round(n / 1024)) + ' ك.ب');
const ROLE = { admin: 'مدير النظام', supervisor: 'مشرف', teacher: 'معلم' };

// عدّاد الرسائل غير المقروءة (شارة القائمة). يتجدد كل دقيقة ويُستدعى refresh بعد تأكيد القراءة.
export function useMsgUnread(enabled) {
  const [n, setN] = useState(0);
  const refresh = useCallback(() => { if (enabled) api('/messages/inbox/count').then((d) => setN(d.unread)).catch(() => {}); }, [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [enabled, refresh]);
  return [n, refresh];
}

// مرفقات الرسالة: الصور تُعرض مصغّرة، وPDF رابط تنزيل
function Attachments({ list }) {
  if (!list?.length) return null;
  return (
    <div className="matt">
      {list.map((a) => (a.mime.startsWith('image/')
        ? <a key={a.id} href={`/api/messages/files/${a.id}`} target="_blank" rel="noreferrer" title={a.name}><img src={`/api/messages/files/${a.id}`} alt={a.name} loading="lazy" /></a>
        : <a key={a.id} className="chip" href={`/api/messages/files/${a.id}`} target="_blank" rel="noreferrer"><Icon name="file" size={18} /> {a.name} · {kb(a.size)}</a>))}
    </div>
  );
}

function MessageBody({ m }) {
  return (
    <>
      <div className="small muted">{m.sender.name}{m.sender.role ? ` · ${ROLE[m.sender.role] || ''}` : ''} · {fmtDT(m.at)}</div>
      {m.title && <h4 style={{ margin: '6px 0' }}>{m.title}</h4>}
      {m.body && <p className="mbody">{m.body}</p>}
      <Attachments list={m.attachments} />
    </>
  );
}

// نافذة تظهر عند فتح التطبيق بالرسائل غير المؤكدة: زر «تأكيد القراءة» يسجّل القراءة، و«لاحقاً» تعيد عرضها في الفتح القادم
export function MessagePopup({ onChange }) {
  const [list, setList] = useState([]);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api('/messages/inbox?unread=1&limit=20').then((d) => setList(d.items)).catch(() => {}); }, []);
  if (!list.length || i >= list.length) return null;
  const m = list[i];
  async function confirm() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await api(`/messages/inbox/${m.id}/read`, { method: 'POST' });
      onChange?.();
      setI(i + 1);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`رسالة جديدة${list.length > 1 ? ` (${i + 1} من ${list.length})` : ''}`} onClose={() => setList([])}>
      <MessageBody m={m} />
      {err && <div className="alert">{err}</div>}
      <button className="btn block" disabled={busy} onClick={confirm}><Icon name="check" size={20} /> {busy ? 'جارٍ التأكيد…' : 'تأكيد القراءة'}</button>
      <button className="btn ghost block" onClick={() => setList([])}>لاحقاً</button>
    </Modal>
  );
}

// تصغير الصور الكبيرة قبل الرفع (توفير للمساحة والإنترنت)
async function shrinkImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

const Check = ({ checked, onChange, children }) => <label className="check"><input type="checkbox" checked={checked} onChange={onChange} /><span>{children}</span></label>;

// كتابة رسالة. المدير والمشرف: للمعلمين (الكل | محددون) أو للطلاب (الكل | تصفية). المعلم: لكل طلابه، أو لطالب واحد (preset).
export function ComposeMessage({ me, preset, onClose, onDone }) {
  const manager = me.role !== 'teacher';
  const [audience, setAudience] = useState('students');
  const [scope, setScope] = useState(preset ? 'student' : 'all');
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [pickT, setPickT] = useState(new Set());
  const [pickL, setPickL] = useState(new Set());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const requestId = useRef(newId());
  const fileInput = useRef(null);

  useEffect(() => {
    if (!manager) return;
    api('/users?role=teacher&status=active&limit=200').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [manager]);

  const toggle = (set, setSet, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setSet(n); };
  const chooseAudience = (a) => { setAudience(a); setScope('all'); };

  async function addFiles(e) {
    const chosen = [...e.target.files]; e.target.value = '';
    if (!chosen.length) return;
    if (files.length + chosen.length > MAX_FILES) return setErr(`الحد الأقصى ${MAX_FILES} مرفقات`);
    setUploading(true); setErr('');
    try {
      for (const f0 of chosen) {
        const f = await shrinkImage(f0);
        if (f.size > MAX_BYTES) throw new Error(`«${f0.name}» أكبر من 5 ميغابايت`);
        const r = await upload('/messages/attachments?name=' + encodeURIComponent(f.name), f);
        setFiles((cur) => [...cur, r]);
      }
    } catch (er) { setErr(er.message); } finally { setUploading(false); }
  }

  const problem = (() => {
    if (!body.trim() && !files.length) return 'اكتب نص الرسالة أو أرفق ملفاً';
    if (audience === 'teachers' && scope === 'selected' && !pickT.size) return 'اختر معلماً واحداً على الأقل';
    if (audience === 'students' && scope === 'filter' && !pickT.size && !pickL.size) return 'اختر مستوى أو معلماً للتصفية';
    return '';
  })();

  async function submit(e) {
    e.preventDefault();
    if (busy || uploading || problem) return;
    setBusy(true); setErr('');
    try {
      const r = await api('/messages', { method: 'POST', body: {
        title, body, audience, scope, requestId: requestId.current, attachmentIds: files.map((f) => f.id),
        teacherIds: [...pickT], levelIds: [...pickL], studentId: preset?.studentId,
      } });
      onDone(r.duplicate ? 'هذه الرسالة أُرسلت مسبقاً، لم تُكرَّر'
        : `تم إرسال الرسالة إلى ${r.recipients} مستلم${r.skipped ? `، ولم تصل إلى ${r.skipped} طالب لعدم وجود حساب فعّال لهم` : ''}`);
    } catch (er) { setErr(er.message); setBusy(false); }
  }

  const seg = (on, set, label) => <button type="button" className={'btn seg' + (on ? ' on' : '')} onClick={set}>{label}</button>;

  return (
    <Modal title={preset ? `رسالة إلى ${preset.studentName}` : 'رسالة جديدة'} onClose={onClose}>
      <form onSubmit={submit}>
        {preset ? <p className="small muted" style={{ marginTop: 0 }}>تصل الرسالة إلى حساب الطالب في بوابته.</p> : (
          <>
            {manager && <div className="row">{seg(audience === 'students', () => chooseAudience('students'), 'للطلاب')}{seg(audience === 'teachers', () => chooseAudience('teachers'), 'للمعلمين')}{seg(audience === 'both', () => chooseAudience('both'), 'للمعلمين والطلاب معاً')}</div>}
            {audience === 'both' ? <p className="small muted">تصل الرسالة نفسها إلى كل المعلمين وكل الطلاب (من لديهم حسابات فعّالة)، ويظهر لك من قرأها منهم جميعاً في قائمة واحدة.</p> : <div className="row">
              {audience === 'teachers' ? <>{seg(scope === 'all', () => setScope('all'), 'كل المعلمين')}{seg(scope === 'selected', () => setScope('selected'), 'معلمون محددون')}</>
                : manager ? <>{seg(scope === 'all', () => setScope('all'), 'كل الطلاب')}{seg(scope === 'filter', () => setScope('filter'), 'تصفية')}</>
                  : seg(true, () => {}, 'كل طلابي')}
            </div>}
            {audience === 'teachers' && scope === 'selected' && (
              <div className="bsurahs">{teachers.map((t) => <Check key={t.id} checked={pickT.has(t.id)} onChange={() => toggle(pickT, setPickT, t.id)}>{t.name}</Check>)}{!teachers.length && <Empty text="لا يوجد معلمون" />}</div>
            )}
            {audience === 'students' && scope === 'filter' && (
              <>
                <b className="small">المستوى</b>
                <div className="bsurahs" style={{ maxHeight: '20vh' }}>{levels.map((l) => <Check key={l.id} checked={pickL.has(l.id)} onChange={() => toggle(pickL, setPickL, l.id)}>{l.name}</Check>)}</div>
                <b className="small">المعلم</b>
                <div className="bsurahs" style={{ maxHeight: '20vh' }}>{teachers.map((t) => <Check key={t.id} checked={pickT.has(t.id)} onChange={() => toggle(pickT, setPickT, t.id)}>{t.name}</Check>)}</div>
                <p className="small muted">إن اخترت مستوى ومعلماً معاً فالمستلمون هم طلاب هذا المستوى عند هؤلاء المعلمين.</p>
              </>
            )}
          </>
        )}

        <label>العنوان (اختياري)<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></label>
        <label>نص الرسالة<textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></label>
        <div className="small muted" style={{ marginTop: -6, marginBottom: 8 }}>{body.length} / 2000</div>

        <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={addFiles} />
        <button type="button" className="chip" disabled={uploading || files.length >= MAX_FILES} onClick={() => fileInput.current.click()}><Icon name="clip" size={18} /> {uploading ? 'جارٍ الرفع…' : 'إرفاق صورة أو PDF'}</button>
        <span className="small muted"> حتى {MAX_FILES} ملفات، كل منها 5 م.ب</span>
        {files.length > 0 && (
          <div className="matt" style={{ marginTop: 8 }}>
            {files.map((f) => <span key={f.id} className="chip">{f.name} · {kb(f.size)} <button type="button" aria-label="إزالة" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>✕</button></span>)}
          </div>
        )}

        {(err || problem) && <div className="alert" style={{ marginTop: 10 }}>{err || problem}</div>}
        <button className="btn block" style={{ marginTop: 10 }} disabled={busy || uploading || !!problem}><Icon name="send" size={20} /> {busy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
      </form>
    </Modal>
  );
}

function SentDetail({ id, onClose, onDeleted, online }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/messages/sent/' + id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  async function del() {
    if (busy || !window.confirm('حذف هذه الرسالة وكل مرفقاتها نهائياً من جميع المستلمين؟')) return;
    setBusy(true);
    try { await api('/messages/sent/' + id, { method: 'DELETE' }); onDeleted(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  const read = d ? d.recipients.filter((r) => r.read).length : 0;
  return (
    <Modal title="تفاصيل الرسالة" onClose={onClose}>
      {!d && !err && <Loading />}
      {err && <div className="alert">{err}</div>}
      {d && (
        <>
          <MessageBody m={{ ...d.message, sender: d.message.sender }} />
          <p className="small"><b>المستلمون:</b> {d.message.scopeLabel}{d.message.skipped ? ` · لم تصل إلى ${d.message.skipped} طالب لعدم وجود حساب لهم` : ''}</p>
          <h4 style={{ margin: '10px 0 6px' }}>قرأها {read} من {d.recipients.length}</h4>
          <div className="bsurahs">
            {d.recipients.map((r, i) => (
              <div key={i} className="row between" style={{ padding: '6px 0' }}>
                <span>{r.name}</span>
                {r.read ? <span className="tag ok">✓ مقروء {fmtDT(r.readAt)}</span> : <span className="tag">لم يقرأ بعد</span>}
              </div>
            ))}
          </div>
          <button className="btn ghost danger block" style={{ marginTop: 10 }} disabled={busy || !online} onClick={del}><Icon name="trash" size={20} /> حذف الرسالة</button>
        </>
      )}
    </Modal>
  );
}

function Inbox({ online, onChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const flash = useFlash();
  const load = useCallback(async (page = 1, append = false) => {
    try { const d = await api('/messages/inbox?page=' + page); setData((c) => ({ ...d, page, items: append ? [...c.items, ...d.items] : d.items })); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function confirm(m) {
    if (busy) return;
    setBusy(m.id);
    try {
      await api(`/messages/inbox/${m.id}/read`, { method: 'POST' });
      setData((c) => ({ ...c, items: c.items.map((x) => (x.id === m.id ? { ...x, read: true, readAt: new Date().toISOString() } : x)) }));
      onChange?.();
    } catch (e) { flash.err(e); } finally { setBusy(''); }
  }
  if (error) return <ErrorBox msg={error} onRetry={() => load()} />;
  if (!data) return <Loading />;
  return (
    <div>
      {flash.node}
      {!data.items.length && <Empty text="لا توجد رسائل" />}
      {data.items.map((m) => (
        <div key={m.id} className={'card' + (m.read ? '' : ' unread')}>
          <MessageBody m={m} />
          {m.read
            ? <div className="small muted" style={{ marginTop: 8 }}>✓ تمت القراءة {fmtDT(m.readAt)}</div>
            : <button className="btn block" style={{ marginTop: 10 }} disabled={busy === m.id || !online} onClick={() => confirm(m)}><Icon name="check" size={20} /> تأكيد القراءة</button>}
        </div>
      ))}
      {data.page < data.pages && <button className="btn ghost block" onClick={() => load(data.page + 1, true)}>عرض المزيد</button>}
    </div>
  );
}

function Sent({ online, reloadKey, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async (page = 1, append = false) => {
    try { const d = await api('/messages/sent?page=' + page); setData((c) => ({ ...d, page, items: append ? [...c.items, ...d.items] : d.items })); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);
  if (error) return <ErrorBox msg={error} onRetry={() => load()} />;
  if (!data) return <Loading />;
  return (
    <div>
      {!data.items.length && <Empty text="لا توجد رسائل مرسلة" />}
      {data.items.map((m) => (
        <button key={m.id} type="button" className="card sbtn" onClick={() => onOpen(m.id)}>
          <span className="row between"><b>{m.title || m.preview.slice(0, 40) || 'مرفقات'}</b><small className="muted">{fmtDT(m.at)}</small></span>
          <span className="small muted">{m.scopeLabel}{!m.sender.mine ? ` · من ${m.sender.name}` : ''}</span>
          <span className="small"><span className={'tag ' + (m.read === m.recipients ? 'ok' : '')}>قرأها {m.read} من {m.recipients}</span>{m.attachments > 0 && <span className="small muted"> · {m.attachments} مرفق</span>}{m.skipped > 0 && <span className="small muted"> · {m.skipped} بلا حساب</span>}</span>
        </button>
      ))}
      {data.page < data.pages && <button className="btn ghost block" onClick={() => load(data.page + 1, true)}>عرض المزيد</button>}
    </div>
  );
}

// صفحة الرسائل: الواردة للجميع (حتى الطالب)، والمرسلة لمن يملك الإرسال
export default function Messages({ me, online, onChange }) {
  const { teachersCanMessage } = useSettings();
  const isStaff = me.role !== 'student';
  const canSend = isStaff && (me.role !== 'teacher' || !!teachersCanMessage);
  const [tab, setTab] = useState('inbox');
  const [compose, setCompose] = useState(false);
  const [detail, setDetail] = useState(null);
  const [key, setKey] = useState(0);
  const flash = useFlash();
  return (
    <div>
      {flash.node}
      {isStaff && (
        <div className="row" style={{ marginBottom: 10 }}>
          <button className={'btn seg' + (tab === 'inbox' ? ' on' : '')} onClick={() => setTab('inbox')}>الواردة</button>
          <button className={'btn seg' + (tab === 'sent' ? ' on' : '')} onClick={() => setTab('sent')}>المرسلة</button>
        </div>
      )}
      {canSend && <button className="btn block" style={{ marginBottom: 12 }} disabled={!online} onClick={() => setCompose(true)}><Icon name="send" size={20} /> رسالة جديدة</button>}
      {isStaff && me.role === 'teacher' && !canSend && <p className="small muted">إرسال الرسائل غير مفعّل للمعلمين حالياً.</p>}
      {tab === 'inbox' ? <Inbox online={online} onChange={onChange} /> : <Sent online={online} reloadKey={key} onOpen={setDetail} />}
      {compose && <ComposeMessage me={me} onClose={() => setCompose(false)} onDone={(m) => { setCompose(false); flash.ok(m); setTab('sent'); setKey((k) => k + 1); }} />}
      {detail && <SentDetail id={detail} online={online} onClose={() => setDetail(null)} onDeleted={() => { setDetail(null); flash.ok('حُذفت الرسالة'); setKey((k) => k + 1); }} />}
    </div>
  );
}
