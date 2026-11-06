import { useState } from 'react';
import { api } from '../api.js';
import { Empty, IconBtn, Loading, Modal, useFlash, useLoad } from '../ui.jsx';

// إدارة قراء المصحف (مدير النظام): الرابط يشير إلى ملف الآية الواحدة، و{s} رقم السورة و{a} رقم الآية بثلاث خانات
const sample = (t) => t.replace(/\{s\}/g, '001').replace(/\{a\}/g, '001');

// اختبار حقيقي من المتصفح: هل يُحمَّل ملف الفاتحة (1:1) من هذا الرابط؟
function testUrl(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    const end = (ok) => { if (done) return; done = true; clearTimeout(t); a.removeAttribute('src'); resolve(ok); };
    const t = setTimeout(() => end(false), 10000);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => end(true));
    a.addEventListener('error', () => end(false));
    a.src = url;
    a.load();
  });
}

export default function Readers({ online }) {
  const ld = useLoad(() => api('/readers'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});
  const flash = useFlash();

  async function run(fn, ok) {
    setBusy(true); flash.clear();
    try { await fn(); if (ok) flash.ok(ok); await ld.reload(); return true; } catch (e) { flash.err(e); return false; } finally { setBusy(false); }
  }
  async function test(r) {
    setTests((t) => ({ ...t, [r.id]: 'wait' }));
    const ok = await testUrl(sample(r.urlTemplate));
    setTests((t) => ({ ...t, [r.id]: ok ? 'ok' : 'bad' }));
  }
  async function save(e) {
    e.preventDefault();
    const body = { name: form.name, urlTemplate: form.urlTemplate };
    const ok = await run(() => (form.id ? api('/readers/' + form.id, { method: 'PATCH', body }) : api('/readers', { method: 'POST', body })), 'تم الحفظ');
    if (ok) setForm(null);
  }
  function move(items, i, d) {
    const a = items[i], b = items[i + d];
    if (!a || !b) return;
    run(async () => {
      await api('/readers/' + a.id, { method: 'PATCH', body: { order: b.order } });
      await api('/readers/' + b.id, { method: 'PATCH', body: { order: a.order } });
    });
  }
  function remove(r) {
    if (!window.confirm(`حذف القارئ «${r.name}» من المصحف؟`)) return;
    run(() => api('/readers/' + r.id, { method: 'DELETE' }), 'تم الحذف');
  }

  const items = ld.data?.items || [];
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 className="h" style={{ margin: 0 }}>قراء المصحف</h2>
        <IconBtn icon="plus" tone="on" caption="قارئ" label="إضافة قارئ" disabled={!online} onClick={() => setForm({ name: '', urlTemplate: '' })} />
      </div>
      {flash.node}
      <p className="small muted">يظهر القارئ المفعَّل في المصحف للجميع. التلاوات تُبثّ من الرابط مباشرة ولا تُخزَّن في الخادم. استخدم زر الاختبار للتأكد أن الرابط يعمل من جهازك.</p>
      {ld.loading && <Loading />}
      {ld.error && <div className="alert">{ld.error}</div>}
      {ld.data && !items.length && <Empty text="لا يوجد قراء. أضف قارئاً ليظهر في المصحف." />}
      {items.map((r, i) => (
        <div className="card item" key={r.id} style={{ opacity: r.enabled ? 1 : 0.65 }}>
          <div className="row between">
            <b>{r.name}</b>
            <span>
              {tests[r.id] === 'wait' && <span className="tag">جارٍ الاختبار…</span>}
              {tests[r.id] === 'ok' && <span className="tag ok">الرابط يعمل</span>}
              {tests[r.id] === 'bad' && <span className="tag bad">تعذّر تحميل الصوت</span>}
              {!r.enabled && <span className="tag warn">موقوف</span>}
            </span>
          </div>
          <div className="pre" style={{ margin: 0 }}>{r.urlTemplate}</div>
          <div className="irow">
            <IconBtn icon="play" tone="ok" label="اختبار الرابط (سورة الفاتحة آية 1)" disabled={tests[r.id] === 'wait'} onClick={() => test(r)} />
            <IconBtn icon="arrowup" label="تقديم" disabled={busy || !online || i === 0} onClick={() => move(items, i, -1)} />
            <IconBtn icon="down" label="تأخير" disabled={busy || !online || i === items.length - 1} onClick={() => move(items, i, 1)} />
            <IconBtn icon="power" tone={r.enabled ? 'gold' : 'ok'} label={r.enabled ? 'إيقاف القارئ' : 'تفعيل القارئ'} disabled={busy || !online} onClick={() => run(() => api('/readers/' + r.id, { method: 'PATCH', body: { enabled: !r.enabled } }))} />
            <IconBtn icon="edit" label="تعديل" disabled={!online} onClick={() => setForm({ id: r.id, name: r.name, urlTemplate: r.urlTemplate })} />
            <IconBtn icon="trash" tone="danger" label="حذف" disabled={busy || !online} onClick={() => remove(r)} />
          </div>
        </div>
      ))}
      {form && (
        <Modal title={form.id ? 'تعديل قارئ' : 'إضافة قارئ'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <label>اسم القارئ<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>رابط ملف الآية
              <input dir="ltr" value={form.urlTemplate} placeholder="https://example.com/reader/{s}{a}.mp3" onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })} required />
            </label>
            <p className="small muted">ضع <b dir="ltr">{'{s}'}</b> مكان رقم السورة و<b dir="ltr">{'{a}'}</b> مكان رقم الآية (3 خانات مثل 001). يجب أن يبدأ بـ https وأن يكون ملفاً لآية واحدة. مثال: <span dir="ltr">https://everyayah.com/data/Alafasy_128kbps/{'{s}{a}'}.mp3</span></p>
            <button className="btn block" disabled={busy || !online}>حفظ</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
