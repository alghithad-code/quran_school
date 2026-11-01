// طبقة الاتصال: النظام يعمل أونلاين فقط، فلا تُرسل عمليات التعديل دون اتصال.
let csrf = '';
export const setCsrf = (t) => (csrf = t || '');

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'حدث خطأ');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function api(path, { method = 'GET', body } = {}) {
  if (method !== 'GET' && !navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت. الاتصال مطلوب لحفظ البيانات.');
  let res;
  try {
    res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت.');
  }
  return handle(res);
}

export async function upload(path, file) {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت.');
  let res;
  try {
    res = await fetch('/api' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': csrf }, body: file });
  } catch {
    throw new Error('تعذّر الاتصال بالخادم.');
  }
  return handle(res);
}
