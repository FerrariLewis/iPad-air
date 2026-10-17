/* 用户提供的图片弹窗：原图展示、平滑出入场及键盘焦点管理。 */
(() => {
  'use strict';
  const trigger = document.getElementById('support-open');
  const dialog = document.getElementById('support-dialog');
  const closeButton = document.getElementById('support-close');
  if (!trigger || !dialog || !closeButton) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const native = typeof dialog.showModal === 'function';
  const background = [...document.querySelectorAll('body > header, body > main, body > footer')];
  let closing = false, closeTimer = 0, previousFocus = null, savedBackground = [];

  function restoreBackground() {
    savedBackground.forEach(({ node, inert, hidden }) => {
      if (!inert) node.removeAttribute('inert');
      if (hidden === null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', hidden);
    });
    savedBackground = [];
  }
  function tidy() {
    clearTimeout(closeTimer);
    closing = false;
    dialog.classList.remove('is-closing');
    document.documentElement.classList.remove('support-is-open');
    trigger.setAttribute('aria-expanded', 'false');
    restoreBackground();
    if (previousFocus && previousFocus.isConnected) {
      try { previousFocus.focus({ preventScroll: true }); } catch (_) { previousFocus.focus(); }
    }
    previousFocus = null;
  }
  function finishClose() {
    if (native && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    tidy();
  }
  function close() {
    if (!dialog.hasAttribute('open') || closing) return;
    closing = true;
    dialog.classList.add('is-closing');
    closeTimer = setTimeout(finishClose, reduced.matches ? 0 : 220);
  }
  function open() {
    if (dialog.hasAttribute('open')) return;
    clearTimeout(closeTimer);
    previousFocus = trigger;
    dialog.classList.remove('is-closing');
    closing = false;
    document.documentElement.classList.add('support-is-open');
    if (native) dialog.showModal();
    else {
      dialog.classList.add('is-fallback');
      dialog.setAttribute('open', '');
      savedBackground = background.map(node => ({ node, inert: node.hasAttribute('inert'), hidden: node.getAttribute('aria-hidden') }));
      savedBackground.forEach(({ node }) => { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); });
    }
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!dialog.open) tidy(); });
  document.addEventListener('keydown', event => {
    if (!dialog.hasAttribute('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') { event.preventDefault(); closeButton.focus({ preventScroll: true }); }
  });
  window.addEventListener('pagehide', () => {
    if (dialog.hasAttribute('open')) finishClose();
  });
})();
