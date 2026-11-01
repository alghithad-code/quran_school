import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, FILTER_AR, Loading, Modal, STATUS_AR, go, qs, todayStr, useFlash } from '../ui.jsx';

const blank = { name: '', age: '', phone: '', enrolledAt: todayStr(), teacherId: '', levelId: '', position: '', notes: '' };

export default function Students({ me, online, query }) {
  const isManager = me.role !== 'teacher';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: null, total: 0, pages: 1 });
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [form, setForm] = useState(null);
  const [move, setMove] = useState(null); // {to}
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const key = JSON.stringify(query);

  useEffect(() => {
    if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);

  const load = useCallback(async (p = 1, append = false) => {
    try {
      const d = await api('/students' + qs({ ...query, q, page: p, limit: 30 }));
      setData((cur) => ({ ...d, items: append ? [...(cur.items || []), ...d.items] : d.items }));
      setPage(p);
    } catch (e) { flash.err(e); setData((c) => ({ ...c, items: c.items || [] })); }
  }, [key, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(new Set()); const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  const setFilter = (k, v) => go('/students' + qs({ ...query, [k]: v }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function mark(s, status) {
    try {
      await api(`/students/${s.id}/attendance`, { method: 'POST', body: { status } });
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, today: status } : x)) })); // بعد تأكيد الخادم
    } catch (e) { flash.err(e); }
  }
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/students', { method: 'POST', body: form });
      flash.ok('تمت إضافة الطالب'); setForm(null); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function doMove() {
    setBusy(true);
    try {
      const r = await api('/transfers', { method: 'POST', body: { studentIds: [...sel], toTeacherId: move.to } });
      flash.ok(`تم نقل ${r.moved} طالب` + (r.skipped ? ` (تجاوز ${r.skipped} مرتبطاً بالمعلم نفسه)` : ''));
      setMove(null); setSel(new Set()); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const items = data.items;
  const selected = (items || []).filter((s) => sel.has(s.id));
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name;

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
        {isManager && <button className="btn" disabled={!online} onClick={() => setForm({ ...blank })}>+ طالب</button>}
      </div>

      <div className="chips">
        {query.filter && <button className="chip on" onClick={() => setFilter('filter', '')}>{FILTER_AR[query.filter]} ✕</button>}
        <button className={'chip' + (query.today === '1' ? ' on' : '')} onClick={() => setFilter('today', query.today === '1' ? '' : '1')}>موعدهم اليوم</button>
        <select className="chip" value={query.status || 'active'} onChange={(e) => setFilter('status', e.target.value === 'active' ? '' : e.target.value)}>
          <option value="active">النشطون</option><option value="paused">المتوقفون</option><option value="archived">المؤرشفون</option><option value="all">الكل</option>
        </select>
        <select className="chip" value={query.levelId || ''} onChange={(e) => setFilter('levelId', e.target.value)}>
          <option value="">كل المستويات</option><option value="none">بلا مستوى</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {isManager && (
          <select className="chip" value={query.teacherId || ''} onChange={(e) => setFilter('teacherId', e.target.value)}>
            <option value="">كل المعلمين</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {flash.node}

      {isManager && items?.length > 0 && (
        <div className="row">
          <button className="btn ghost" onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((s) => s.id)))}>{sel.size === items.length ? 'إلغاء التحديد' : 'تحديد الكل'}</button>
          {sel.size > 0 && <button className="btn" disabled={!online} onClick={() => setMove({ to: '' })}>نقل المحدد ({sel.size})</button>}
        </div>
      )}

      {items === null && <Loading />}
      {items?.length === 0 && <Empty text="لا يوجد طلاب مطابقون" />}
      {items?.map((s) => (
        <div className="card item" key={s.id}>
          <div className="row between">
            <a className="name" href={'#/students/' + s.id}>
              {isManager && <input type="checkbox" checked={sel.has(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(s.id)} />}
              {' '}{s.name}
            </a>
            {s.status !== 'active' && <span className="tag bad">{STATUS_AR[s.status]}</span>}
          </div>
          <div className="muted small">
            {s.level?.name || 'بلا مستوى'}{isManager && ` · ${s.teacher.name || ''}`}{s.schedule?.arrivalTime && ` · يحضر ${s.schedule.arrivalTime}`}
          </div>
          {s.status === 'active' && (
            <div className="row" style={{ marginBottom: 0 }}>
              <button className={'btn seg' + (s.today === 'present' ? ' on' : '')} disabled={!online} onClick={() => mark(s, 'present')}>حاضر</button>
              <button className={'btn seg bad' + (s.today === 'absent' ? ' on' : '')} disabled={!online} onClick={() => mark(s, 'absent')}>غائب</button>
              <a className="btn ghost" href={'#/students/' + s.id}>الملف</a>
            </div>
          )}
        </div>
      ))}
      {page < data.pages && <button className="btn ghost block" onClick={() => load(page + 1, true)}>عرض المزيد ({data.total - (items?.length || 0)} متبقٍ)</button>}

      {form && (
        <Modal title="طالب جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <label>الاسم<input value={form.name} onChange={set('name')} required /></label>
            <label>المعلم<select value={form.teacherId} onChange={set('teacherId')} required><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>المستوى<select value={form.levelId} onChange={set('levelId')}><option value="">بلا مستوى</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>العمر<input type="number" inputMode="numeric" min="3" max="100" value={form.age} onChange={set('age')} /></label>
            <label>رقم الهاتف (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set('phone')} /></label>
            <label>تاريخ الالتحاق<input type="date" max={todayStr()} value={form.enrolledAt} onChange={set('enrolledAt')} /></label>
            <label>موضع الحفظ الحالي<input value={form.position} onChange={set('position')} /></label>
            <label>ملاحظات<input value={form.notes} onChange={set('notes')} /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}

      {move && (
        <Modal title="نقل الطلاب" onClose={() => setMove(null)}>
          <label>المعلم الجديد<select value={move.to} onChange={(e) => setMove({ to: e.target.value })}><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {move.to && (
            <div className="card">
              <b>مراجعة قبل التأكيد</b>
              <p className="small muted">سيُنقل {selected.length} طالب إلى «{teacherName(move.to)}»:</p>
              {selected.map((s) => <div className="line" key={s.id}><span>{s.name}</span><small className="muted">من {s.teacher.name}</small></div>)}
              <p className="small muted">تبقى كل سجلاتهم السابقة كما هي، ويصل إشعار للمعلم الجديد.</p>
            </div>
          )}
          <button className="btn block" disabled={busy || !move.to} onClick={doMove}>{busy ? 'جارٍ النقل…' : 'تأكيد النقل'}</button>
        </Modal>
      )}
    </div>
  );
}
