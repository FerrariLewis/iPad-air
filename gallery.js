/* 定睛细看：角度横滑独立控制；颜色仍由 script.js 同步切换各角度图片。 */
(() => {
  'use strict';
  const track = document.getElementById('angle-track');
  if (!track) return;
  const panels = [...track.querySelectorAll('.angle-panel')];
  const choices = [...document.querySelectorAll('[data-angle-index]')];
  const previous = document.getElementById('angle-prev');
  const next = document.getElementById('angle-next');
  const status = document.getElementById('angle-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!panels.length || !previous || !next || !status) return;
  let active = 0;
  let programmatic = false;
  let pointerHeld = false;
  let settleTimer = 0;
  let fallbackTimer = 0;
  let resizeFrame = 0;
  let measuredWidth = track.clientWidth;
  const motionDisabled = () => reduced.matches || document.documentElement.classList.contains('motion-off');

  function targetFor(index) {
    const rect = panels[index].getBoundingClientRect();
    const outer = track.getBoundingClientRect();
    return Math.max(0, Math.min(track.scrollWidth - track.clientWidth,
      track.scrollLeft + rect.left - outer.left - (track.clientWidth - rect.width) / 2));
  }
  function markCurrent(index) {
    active = index;
    track.dataset.angle = String(index + 1);
    choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    previous.disabled = active === 0;
    next.disabled = active === panels.length - 1;
    status.textContent = `${active + 1} / ${panels.length}`;
  }
  function release() {
    clearTimeout(fallbackTimer);
    programmatic = false;
  }
  function choose(index, smooth = true) {
    clearTimeout(settleTimer);
    clearTimeout(fallbackTimer);
    markCurrent(Math.max(0, Math.min(panels.length - 1, index)));
    const target = targetFor(active);
    const animated = smooth && !motionDisabled();
    programmatic = Math.abs(target - track.scrollLeft) > 1;
    track.scrollTo({ left: target, behavior: animated ? 'smooth' : 'instant' });
    if (programmatic) fallbackTimer = setTimeout(release, animated ? 1100 : 180);
  }

  function completeScroll() {
    clearTimeout(settleTimer);
    // 拖动途中短暂停顿不算选定，等松手和惯性滚动结束再更新按钮。
    if (pointerHeld) return;
    if (programmatic) { release(); return; }
    let closest = 0;
    let distance = Infinity;
    panels.forEach((panel, index) => {
      const difference = Math.abs(track.scrollLeft - targetFor(index));
      if (difference < distance) { distance = difference; closest = index; }
    });
    markCurrent(closest);
  }
  function settleScroll() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(completeScroll, 160);
  }
  function interruptNavigation() {
    const wasProgrammatic = programmatic;
    release();
    if (wasProgrammatic) track.scrollTo({ left: track.scrollLeft, behavior: 'instant' });
  }
  function releasePointer() {
    if (!pointerHeld) return;
    pointerHeld = false;
    settleScroll();
  }
  function syncMotionPreference() {
    if (motionDisabled() && programmatic) choose(active, false);
  }
  choices.forEach((button, index) => button.addEventListener('click', () => choose(index)));
  previous.addEventListener('click', () => choose(active - 1));
  next.addEventListener('click', () => choose(active + 1));
  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      choose(event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 :
        active + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  track.addEventListener('pointerdown', () => {
    pointerHeld = true;
    interruptNavigation();
  }, { passive: true });
  document.addEventListener('pointerup', releasePointer, { passive: true });
  document.addEventListener('pointercancel', releasePointer, { passive: true });
  window.addEventListener('blur', releasePointer);
  track.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) > 1 || event.shiftKey) interruptNavigation();
  }, { passive: true });
  track.addEventListener('scroll', settleScroll, { passive: true });
  track.addEventListener('scrollend', completeScroll, { passive: true });
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const width = track.clientWidth;
      if (Math.abs(width - measuredWidth) < 1) return;
      measuredWidth = width;
      choose(active, false);
    });
  }
  function restorePosition() {
    measuredWidth = track.clientWidth;
    choose(active, false);
  }
  new MutationObserver(syncMotionPreference).observe(document.documentElement,
    { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', syncMotionPreference);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pointerHeld = false; return; }
    if (programmatic) choose(active, false);
    else completeScroll();
  });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('load', restorePosition, { once: true });
  window.addEventListener('pageshow', restorePosition);
  window.addEventListener('pagehide', () => {
    clearTimeout(settleTimer); clearTimeout(fallbackTimer); cancelAnimationFrame(resizeFrame);
  });
  markCurrent(0);
})();

/* 颜色灵动岛只管理装饰进场和选中底色，四角度换色仍由 script.js 统一处理。 */
(() => {
  'use strict';
  const island = document.querySelector('.color-island');
  if (!island) return;
  const buttons = [...island.querySelectorAll('[data-color]')];
  if (!buttons.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionDisabled = () => reduced.matches || document.documentElement.classList.contains('motion-off');
  let observer;
  let layoutFrame = 0;
  let entered = false;

  island.style.setProperty('--color-count', String(buttons.length));
  buttons.forEach((button, index) => button.style.setProperty('--swatch-order', String(index)));

  function positionSelection(button = buttons.find(item => item.getAttribute('aria-pressed') === 'true') || buttons[0]) {
    island.style.setProperty('--selection-left', `${button.offsetLeft}px`);
    island.style.setProperty('--selection-top', `${button.offsetTop}px`);
    island.style.setProperty('--selection-width', `${button.offsetWidth}px`);
    island.style.setProperty('--selection-height', `${button.offsetHeight}px`);
  }
  function scheduleLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      positionSelection();
    });
  }
  function reveal() {
    if (entered) return;
    entered = true;
    island.classList.remove('island-pending');
    island.classList.add('island-entered');
    if (observer) observer.disconnect();
    scheduleLayout();
  }
  function syncMotion() {
    // 系统减少动态效果、手动关闭动画时，所有选项始终可见且可点。
    if (motionDisabled()) reveal();
  }

  buttons.forEach(button => button.addEventListener('click', () => positionSelection(button)));
  // 键盘先于滚动到达控件时立即展开，不把透明控件当作隐藏焦点。
  island.addEventListener('focusin', reveal);
  new MutationObserver(scheduleLayout).observe(island, {
    subtree: true, attributes: true, attributeFilter: ['aria-pressed']
  });
  new MutationObserver(syncMotion).observe(document.documentElement, {
    attributes: true, attributeFilter: ['class']
  });
  reduced.addEventListener('change', syncMotion);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(island);
  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('load', scheduleLayout, { once: true });
  window.addEventListener('pageshow', event => {
    scheduleLayout();
    if (event.persisted) reveal();
  });
  window.addEventListener('pagehide', () => cancelAnimationFrame(layoutFrame));
  scheduleLayout();

  if (motionDisabled() || !('IntersectionObserver' in window)) {
    reveal();
    return;
  }
  // 固定最终尺寸，只有绝对定位的底色从球变成胶囊，因此页面不会跳动。
  island.classList.add('island-pending');
  try {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) reveal();
    }, { threshold: .2, rootMargin: '0px 0px -20px 0px' });
    observer.observe(island);
  } catch (_) {
    reveal();
  }
})();
