/* 先刷重点：官方影片以媒体时钟播放，其余三卡保留轻微动效；播完后平滑换卡。 */
(() => {
  'use strict';
  const section = document.getElementById('highlights');
  const track = document.getElementById('highlight-track');
  if (!section || !track) return;
  const root = document.documentElement;
  const cards = [...track.querySelectorAll('.highlight-card')];
  const dots = [...section.querySelectorAll('[data-highlight-index]')];
  const previous = document.getElementById('highlight-prev');
  const next = document.getElementById('highlight-next');
  const toggle = document.getElementById('highlight-play');
  const caption = document.getElementById('highlight-caption');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!cards.length || !toggle) return;

  const duration = 6200;
  const endHold = 1000;
  const startupWait = 15000;
  const stalledWait = 12000;
  const ua = navigator.userAgent;
  const appleMedia = /iP(?:hone|ad|od)/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua));
  const media = cards.map(card => {
    const video = card.querySelector('video[data-card-video]');
    if (!video) return null;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = false;
    return { video, card, sources: [], source: '', sourceIndex: 0, request: 0,
      pending: false, blocked: false, failed: false, ended: false, ready: false,
      hold: 0, endTime: 0, attemptActive: false,
      stalledFor: 0, lastMediaTime: 0, advanced: false };
  });
  let active = 0;
  let elapsed = 0;
  let frame = 0;
  let stamp = 0;
  let settleTimer = 0;
  let navigationTimer = 0;
  let visible = false;
  let localPaused = false;
  let pointerHeld = false;
  let focusWithin = false;
  let allowFocusedPlay = false;
  let keyboardInput = false;
  let navigating = false;
  let manualScrolling = false;
  let suspended = false;
  let resizeFrame = 0;
  let measuredWidth = track.clientWidth;

  const motionDisabled = () => reduced.matches || root.classList.contains('motion-off');
  const eligible = () => visible && !document.hidden && !suspended && !localPaused &&
    !motionDisabled() && !pointerHeld && !navigating && !manualScrolling &&
    (!focusWithin || allowFocusedPlay) && (!cards[active].querySelector('img') || cards[active].querySelector('img').complete);
  const canPlay = () => eligible() && !media[active]?.blocked;

  function mediaState(item, state) {
    item.card.dataset.cardVideoState = state;
    item.card.classList.toggle('is-card-video-ready', item.ready);
  }

  function pauseVideo(item) {
    if (!item) return;
    item.stalledFor = 0;
    item.lastMediaTime = Number.isFinite(item.video.currentTime) ? item.video.currentTime : 0;
    item.attemptActive = false;
    if (item.pending || !item.video.paused) {
      item.request++;
      item.pending = false;
      item.video.pause();
    }
    if (!item.ended && !item.blocked && !item.failed) mediaState(item, item.ready ? 'paused' : 'idle');
  }

  function resetVideo(item) {
    if (!item) return;
    pauseVideo(item);
    item.request++;
    item.blocked = item.failed = item.ended = item.ready = false;
    item.hold = 0;
    item.endTime = 0;
    item.advanced = false;
    item.sources = [];
    item.source = '';
    try { item.video.currentTime = 0; } catch (_) { /* 未加载元数据时，load 会从零开始。 */ }
    mediaState(item, 'idle');
  }

  function chooseSources(item) {
    const data = item.video.dataset;
    const mobile = matchMedia('(max-width: 700px)').matches;
    const standard = mobile ? (data.mobileSrc || data.desktopSrc) : (data.desktopSrc || data.mobileSrc);
    const hevc = mobile ? (data.mobileHevcSrc || data.desktopHevcSrc) : (data.desktopHevcSrc || data.mobileHevcSrc);
    // Safari 的透明 HEVC 解码失败时，只能降级到明确声明的通用 MP4；透明 WebM 可能显示黑底。
    const standardIsMP4 = /mp4/i.test(data.mediaType || 'video/mp4') || /\.mp4(?:[?#]|$)/i.test(standard || '');
    return [...new Set((appleMedia ? [hevc, standardIsMP4 ? standard : ''] : [standard]).filter(Boolean))];
  }

  function loadSource(item, index) {
    item.sourceIndex = index;
    item.source = item.sources[index] || '';
    item.ready = item.ended = false;
    item.hold = 0;
    item.stalledFor = 0;
    item.lastMediaTime = 0;
    item.advanced = false;
    item.attemptActive = false;
    mediaState(item, 'loading');
    item.video.src = item.source;
    item.video.preload = 'auto';
    item.video.load();
  }

  function failVideo(item) {
    pauseVideo(item);
    if (item.sources[item.sourceIndex + 1]) {
      loadSource(item, item.sourceIndex + 1);
    } else {
      item.failed = true;
      item.ready = false;
      elapsed = 0;
      mediaState(item, 'error');
    }
    syncPlayback();
  }

  function playVideo(item) {
    if (!item || item.pending || item.attemptActive || item.failed || item.blocked || item.ended || !eligible()) return;
    if (!item.source) {
      item.sources = chooseSources(item);
      if (!item.sources.length) { item.failed = true; mediaState(item, 'error'); return; }
      loadSource(item, 0);
    }
    if (!item.video.paused) return;
    const request = ++item.request;
    item.pending = true;
    item.attemptActive = true;
    mediaState(item, 'loading');
    let promise;
    try { promise = item.video.play(); } catch (error) { promise = Promise.reject(error); }
    Promise.resolve(promise).then(() => {
      if (request !== item.request) return;
      item.pending = false;
      if (!eligible() || media[active] !== item) pauseVideo(item);
    }).catch(error => {
      if (request !== item.request) return;
      item.pending = false;
      if (media[active] !== item || !eligible() || error?.name === 'AbortError') return;
      if (error?.name === 'NotSupportedError') { failVideo(item); return; }
      item.attemptActive = false;
      item.blocked = true;
      item.ready = false;
      mediaState(item, 'blocked');
      stopClock();
      updateControls();
    });
  }

  function totalDuration() {
    const item = media[active];
    return item && !item.failed && Number.isFinite(item.video.duration) ?
      Math.max(duration, item.video.duration * 1000 + endHold) : duration;
  }

  function stopClock() {
    cancelAnimationFrame(frame);
    frame = 0;
    stamp = 0;
  }

  function paint() {
    const progress = Math.min(1, elapsed / totalDuration());
    const eased = progress * progress * (3 - 2 * progress);
    cards[active].style.setProperty('--highlight-motion', String(eased));
    dots[active].style.setProperty('--highlight-progress', String(progress));
  }

  function updateControls() {
    const disabled = motionDisabled();
    const focusPaused = focusWithin && !allowFocusedPlay;
    const blocked = !!media[active]?.blocked;
    const paused = localPaused || disabled || focusPaused || blocked;
    toggle.disabled = disabled;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', disabled ? '重点动效已随全站暂停' :
      (blocked ? '播放 M4 影片并继续重点轮播' : ((localPaused || focusPaused) ? '播放重点自动轮播' : '暂停重点自动轮播')));
    toggle.classList.toggle('is-paused', paused);
    caption.textContent = `${active + 1} / ${cards.length} · ${disabled ? '静态浏览' :
      (blocked ? '轻点播放影片' : (localPaused ? '已暂停' : (focusPaused ? '键盘操作中' : '一起看看')))}`;
    section.classList.toggle('highlights-playing', canPlay());
    section.dataset.playback = canPlay() ? 'playing' : 'paused';
  }

  function tick(time) {
    frame = 0;
    if (!canPlay()) { stopClock(); updateControls(); return; }
    // 运动/末帧停留限制补帧量；解码保护按真实前台间隔计时，低帧率也能及时恢复。
    // 暂停和后台会由 stopClock 清空 stamp，恢复首帧不会累计离开期间的时间。
    const wallDelta = stamp ? Math.max(0, time - stamp) : 0;
    const delta = Math.min(80, wallDelta);
    stamp = time;
    const item = media[active];
    if (item && !item.failed) {
      if (item.ended) {
        item.hold += delta;
        elapsed = item.endTime + item.hold;
      } else {
        elapsed = item.video.currentTime * 1000;
        // playing / play() 成功不保证解码时钟真的前进；等待中途缓冲时也保留保护。
        // 只累计当前可见且未暂停轮播的前台帧，后台、手势和手动暂停均不算超时。
        if (item.video.currentTime > item.lastMediaTime + .025) {
          item.advanced = true;
          item.lastMediaTime = item.video.currentTime;
          item.stalledFor = 0;
        } else item.stalledFor += wallDelta;
        if (item.stalledFor >= (item.advanced ? stalledWait : startupWait)) {
          failVideo(item);
          return;
        }
      }
    } else elapsed += delta;
    paint();
    if (elapsed >= totalDuration() && (!item || item.failed || item.ended)) {
      goTo(active + 1);
    } else {
      frame = requestAnimationFrame(tick);
    }
  }

  function syncPlayback() {
    media.forEach((item, index) => {
      if (index !== active || !canPlay()) pauseVideo(item);
    });
    if (canPlay()) {
      playVideo(media[active]);
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      stopClock();
    }
    updateControls();
  }

  function targetFor(index) {
    const card = cards[index].getBoundingClientRect();
    const bounds = track.getBoundingClientRect();
    const centered = track.scrollLeft + card.left - bounds.left - (track.clientWidth - card.width) / 2;
    return Math.max(0, Math.min(track.scrollWidth - track.clientWidth, centered));
  }

  function activate(index, reset = true) {
    const prior = active;
    active = (index + cards.length) % cards.length;
    if (prior !== active) resetVideo(media[prior]);
    if (reset) { elapsed = 0; resetVideo(media[active]); }
    stamp = 0;
    cards.forEach((card, i) => {
      card.classList.toggle('is-current-highlight', i === active);
      if (i !== active) card.style.removeProperty('--highlight-motion');
    });
    dots.forEach((dot, i) => {
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
      dot.style.setProperty('--highlight-progress', '0');
    });
    // 当前张和下一张先准备好，保持离线文件预览也不依赖 fetch。
    [active, (active + 1) % cards.length].forEach(i => {
      const image = cards[i].querySelector('img');
      if (image) image.loading = 'eager';
    });
    section.dataset.activeHighlight = String(active + 1);
    paint();
    updateControls();
  }

  function finishNavigation() {
    clearTimeout(navigationTimer);
    navigating = false;
    syncPlayback();
  }

  function goTo(index, smooth = true, reset = true) {
    stopClock();
    clearTimeout(settleTimer);
    clearTimeout(navigationTimer);
    manualScrolling = false;
    activate(index, reset);
    const left = targetFor(active);
    const moving = Math.abs(track.scrollLeft - left) > 1;
    const animate = moving && smooth && !motionDisabled();
    navigating = moving;
    // 只滚动横向容器，不移动页面和键盘焦点。
    track.scrollTo({ left, behavior: animate ? 'smooth' : 'instant' });
    if (navigating) navigationTimer = setTimeout(finishNavigation, animate ? 1000 : 180);
    syncPlayback();
  }

  function nearestCard() {
    let best = 0;
    let distance = Infinity;
    cards.forEach((card, i) => {
      const delta = Math.abs(track.scrollLeft - targetFor(i));
      if (delta < distance) { distance = delta; best = i; }
    });
    return best;
  }

  function completeScroll() {
    clearTimeout(settleTimer);
    if (pointerHeld) return;
    if (navigating) {
      finishNavigation();
    } else {
      const wasManual = manualScrolling;
      manualScrolling = false;
      const nearest = nearestCard();
      if (wasManual || nearest !== active) activate(nearest);
      syncPlayback();
    }
  }

  function settleScroll() {
    clearTimeout(settleTimer);
    // scrollend 之外保留静止检测，兼容尚未提供该事件的浏览器。
    settleTimer = setTimeout(completeScroll, 160);
  }

  function interruptNavigation() {
    const wasNavigating = navigating;
    navigating = false;
    clearTimeout(navigationTimer);
    if (wasNavigating) {
      // 手动接管时停在当前画面，避免原来的平滑滚动继续与手势争抢。
      track.scrollTo({ left: track.scrollLeft, behavior: 'instant' });
    }
  }

  function syncMotionPreference() {
    if (motionDisabled() && navigating) goTo(active, false, false);
    else syncPlayback();
  }

  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const width = track.clientWidth;
      // 手机地址栏收起只改变高度，不应重新定位卡片或打断计时。
      if (Math.abs(width - measuredWidth) < 1) return;
      measuredWidth = width;
      goTo(active, false, false);
    });
  }

  previous.disabled = false;
  next.disabled = false;
  previous.addEventListener('click', () => goTo(active - 1));
  next.addEventListener('click', () => goTo(active + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  toggle.addEventListener('click', () => {
    const item = media[active];
    if (item?.blocked) {
      item.blocked = false;
      localPaused = false;
    } else localPaused = (focusWithin && !allowFocusedPlay) ? false : !localPaused;
    // 用户明确按播放，即使按钮仍有焦点，也立即恢复。
    allowFocusedPlay = !localPaused;
    syncPlayback();
  });

  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(active + (event.key === 'ArrowLeft' ? -1 : 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      goTo(event.key === 'Home' ? 0 : cards.length - 1);
    }
  });

  track.addEventListener('scroll', () => {
    if (!navigating) { manualScrolling = true; syncPlayback(); }
    settleScroll();
  }, { passive: true });
  track.addEventListener('scrollend', completeScroll, { passive: true });
  track.addEventListener('pointerdown', () => {
    pointerHeld = true;
    interruptNavigation();
    syncPlayback();
  }, { passive: true });
  const releasePointer = () => {
    if (!pointerHeld) return;
    pointerHeld = false;
    settleScroll();
  };
  document.addEventListener('pointerup', releasePointer, { passive: true });
  document.addEventListener('pointercancel', releasePointer, { passive: true });
  track.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) > 1 || event.shiftKey) {
      interruptNavigation();
      manualScrolling = true;
      syncPlayback();
      settleScroll();
    }
  }, { passive: true });

  document.addEventListener('keydown', () => { keyboardInput = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardInput = false; }, true);
  section.addEventListener('focusin', event => {
    // 鼠标点箭头后继续自动播；Tab/读屏焦点进入时停下来供用户操作。
    focusWithin = keyboardInput || event.target.matches(':focus-visible');
    allowFocusedPlay = false;
    syncPlayback();
  });
  section.addEventListener('keydown', () => {
    focusWithin = true;
    allowFocusedPlay = false;
    syncPlayback();
  }, true);
  section.addEventListener('focusout', event => {
    if (!section.contains(event.relatedTarget)) {
      focusWithin = false;
      allowFocusedPlay = false;
      syncPlayback();
    }
  });
  cards.forEach(card => {
    card.querySelector('img')?.addEventListener('load', syncPlayback);
    card.querySelector('img')?.addEventListener('error', syncPlayback);
  });
  media.forEach(item => {
    if (!item) return;
    item.video.addEventListener('playing', () => {
      if (media[active] !== item || !eligible() || item.failed || item.ended) { pauseVideo(item); return; }
      if (item.video.paused || !item.source) return;
      item.ready = true;
      item.blocked = item.pending = false;
      mediaState(item, 'playing');
      syncPlayback();
    });
    item.video.addEventListener('ended', () => {
      // 换卡或重新进入后的旧 ended 回调，不能把刚重置的影片误当成播完。
      if (media[active] !== item || item.failed || !item.source || !item.video.ended) return;
      item.ready = item.ended = true;
      item.hold = 0;
      item.endTime = item.video.currentTime * 1000;
      elapsed = item.endTime;
      mediaState(item, 'ended');
      syncPlayback();
    });
    item.video.addEventListener('loadedmetadata', () => { if (media[active] === item) paint(); });
    item.video.addEventListener('error', () => {
      if (media[active] === item && item.source && !item.failed) failVideo(item);
    });
  });

  function setVisible(value) {
    const entering = value && !visible;
    visible = value;
    if (entering) goTo(active, false, true);
    else syncPlayback();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      setVisible(entries[0].isIntersecting && entries[0].intersectionRatio >= .2);
    }, { threshold: [0, .2, .5, 1] }).observe(track);
  } else {
    const checkVisibility = () => {
      const rect = track.getBoundingClientRect();
      setVisible(rect.top < innerHeight - 100 && rect.bottom > 100);
    };
    window.addEventListener('scroll', checkVisibility, { passive: true });
    checkVisibility();
  }
  new MutationObserver(syncMotionPreference).observe(root, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', syncMotionPreference);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pointerHeld = false;
    // 后台可能冻结滚动回调；回来时对齐已选卡片，避免永久停在导航状态。
    if (!document.hidden && (navigating || manualScrolling)) {
      goTo(manualScrolling ? nearestCard() : active, false, manualScrolling);
    } else syncPlayback();
  });
  window.addEventListener('blur', () => {
    if (pointerHeld) { pointerHeld = false; settleScroll(); }
  });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => {
    suspended = true;
    media.forEach(pauseVideo);
    stopClock();
    clearTimeout(settleTimer);
    clearTimeout(navigationTimer);
    cancelAnimationFrame(resizeFrame);
  });
  window.addEventListener('pageshow', () => {
    suspended = false;
    measuredWidth = track.clientWidth;
    goTo(active, false, true);
  });

  section.classList.add('has-highlight-player');
  activate(0);
  syncPlayback();
})();
