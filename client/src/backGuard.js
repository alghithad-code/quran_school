// الخروج من التطبيق المثبّت بضغطتين على زر الرجوع في الصفحة الأولى.
// يعمل فقط في وضع التطبيق المستقل (PWA)، فلا يزعج من يفتح الموقع في المتصفح.
export function installBackGuard(showToast) {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!standalone) return () => {};
  window.history.replaceState({ ...(window.history.state || {}), root: true }, '');
  window.history.pushState({ guard: true }, '');
  let armed = false;
  let timer;
  const onPop = (e) => {
    if (!(e.state && e.state.root)) return;
    if (armed) { // الضغطة الثانية خلال ثانيتين: نسمح بالخروج
      armed = false;
      clearTimeout(timer);
      window.history.back();
      return;
    }
    armed = true;
    showToast('اضغط مرة أخرى للخروج');
    window.history.pushState({ guard: true }, '');
    timer = setTimeout(() => { armed = false; }, 2000);
  };
  window.addEventListener('popstate', onPop);
  return () => { window.removeEventListener('popstate', onPop); clearTimeout(timer); };
}
