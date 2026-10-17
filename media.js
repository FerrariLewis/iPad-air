/* XR：相邻场景预热、真实首帧显示、自动播放与有界恢复。 */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const apple = /iP(?:hone|ad|od)/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || (/AppleWebKit/i.test(navigator.userAgent) && !/(Chrome|Chromium|Edg|OPR|Android)/i.test(navigator.userAgent));
  let suspended = false, scanFrame = 0;
  const items = [...document.querySelectorAll('[data-section-media]')].map(stage => ({
    stage, video: stage.querySelector('[data-section-video]'),
    status: stage.querySelector('.media-status'),
    visible: false, request: 0, sources: [], index: 0, source: '', state: 'idle',
    watch: 0, retry: 0, frame: 0, decodedFrame: 0, aborts: 0, pauses: 0, gestureUsed: false,
    lastTime: 0, progressed: false, startFrameReady: false, lastProgress: 0
  })).filter(item => item.video);
  const disabled = () => suspended || document.hidden || reduced.matches || connection?.saveData || root.classList.contains('motion-off');
  const now = () => performance.now();
  function state(item, value, message = '') {
    item.state = value;
    item.stage.dataset.videoState = value;
    item.stage.classList.toggle('is-video-ready', value === 'playing' || value === 'ended' || (value === 'loading' && item.startFrameReady));
    if (item.status && item.status.textContent !== message) item.status.textContent = message;
  }
  function clearFrames(item) {
    cancelAnimationFrame(item.frame);
    if (item.decodedFrame && item.video.cancelVideoFrameCallback) item.video.cancelVideoFrameCallback(item.decodedFrame);
    item.frame = item.decodedFrame = 0;
  }
  function clearWatch(item) {
    clearInterval(item.watch); clearTimeout(item.retry);
    item.watch = item.retry = 0;
    clearFrames(item);
  }
  function invalidate(item) {
    item.request++;
    clearWatch(item);
    item.startFrameReady = false;
    item.video.pause();
  }
  function reset(item) {
    invalidate(item);
    item.aborts = 0;
    item.pauses = 0;
    item.progressed = false;
    // 离屏只复位时间，不重新 load；再次进入可直接使用已缓存的首帧和媒体数据。
    if (item.video.readyState >= 1 && item.video.currentTime !== 0) {
      try { item.video.currentTime = 0; } catch (_) { /* 元数据变化时由下次进入复位。 */ }
    }
    state(item, 'idle');
  }
  function candidates(item) {
    const d = item.video.dataset, list = [];
    const add = (url, type, knownSupported = false) => {
      if (url && (knownSupported || item.video.canPlayType(type)) && !list.includes(url)) list.push(url);
    };
    // 磁吸白底场景优先通用 H.264，避免 9MP 透明 VP9/HEVC 在部分设备只解出首帧。
    add(mobile.matches ? d.mobileCompatSrc : d.desktopCompatSrc, 'video/mp4');
    if (!mobile.matches) add(d.mobileCompatSrc, 'video/mp4');
    if (apple && d.desktopHevcSrc) {
      const hevc = item.video.canPlayType('video/quicktime; codecs="hvc1"')
        || item.video.canPlayType('video/mp4; codecs="hvc1"');
      if (hevc) {
        add(mobile.matches ? d.mobileHevcSrc : d.desktopHevcSrc, 'video/quicktime', true);
        if (!mobile.matches) add(d.mobileHevcSrc, 'video/quicktime', true);
      }
    } else {
      add(mobile.matches ? d.mobileSrc : d.desktopSrc, d.mediaType || 'video/mp4');
      if (!mobile.matches) add(d.mobileSrc, d.mediaType || 'video/mp4');
    }
    return list;
  }
  function current(item) {
    return item.video.getAttribute('src') === item.source && item.visible && !disabled();
  }
  function finish(item) {
    if (!current(item) || !item.video.ended) return;
    clearWatch(item);
    state(item, 'ended');
  }
  function observeProgress(item, presentedTime) {
    if (!current(item) || !['loading', 'playing'].includes(item.state)) return;
    const video = item.video;
    if (video.ended) { finish(item); return; }
    // 预热已解出的第 0 帧可立即替换静态终帧；它仍是 loading，不冒充已经播放。
    if (item.state === 'loading' && !video.error && video.readyState >= 2 && !video.seeking && video.currentTime <= .012) {
      item.startFrameReady = true;
      item.stage.classList.add('is-video-ready');
    }
    const time = typeof presentedTime === 'number' ? presentedTime : video.currentTime;
    if (video.readyState >= 2 && !video.paused && !video.seeking && time > item.lastTime + .012) {
      item.lastTime = time;
      item.lastProgress = now();
      item.progressed = true;
      // rVFC 提供已呈现的真实帧；旧浏览器用有可用画面的实际时间进度兜底。
      state(item, 'playing');
      clearFrames(item);
    }
  }
  function watchFirstFrame(item, request) {
    const valid = () => request === item.request && current(item) && item.state === 'loading';
    const tick = () => {
      if (request !== item.request) return;
      item.frame = 0;
      if (!valid()) return;
      observeProgress(item);
      if (valid()) item.frame = requestAnimationFrame(tick);
    };
    item.frame = requestAnimationFrame(tick);
    if (item.video.requestVideoFrameCallback) {
      const decoded = (_, metadata) => {
        if (request !== item.request) return;
        item.decodedFrame = 0;
        if (!valid()) return;
        observeProgress(item, metadata.mediaTime);
        if (valid()) item.decodedFrame = item.video.requestVideoFrameCallback(decoded);
      };
      item.decodedFrame = item.video.requestVideoFrameCallback(decoded);
    }
  }
  function recover(item, value, message) {
    invalidate(item);
    state(item, value, message);
  }
  function nextSource(item) {
    if (!item.visible || disabled()) return;
    if (item.index + 1 < item.sources.length) begin(item, item.index + 1, true);
    else recover(item, 'error', '动画暂时无法播放，已保留产品画面。');
  }
  function watch(item, request) {
    clearWatch(item);
    item.lastProgress = now();
    item.lastTime = 0;
    item.progressed = false;
    item.watch = setInterval(() => {
      if (request !== item.request || !current(item)) return;
      observeProgress(item);
      if (item.state === 'ended') return;
      const elapsed = now() - item.lastProgress;
      // 等待首帧最多 12 秒，已开始后卡住最多 8 秒；只在当前可见播放期间计时。
      if (elapsed >= (item.progressed ? 8000 : 12000)) nextSource(item);
    }, 400);
    // 首帧单独逐帧检测，不再等待最长 400ms 的卡顿监测间隔。
    watchFirstFrame(item, request);
  }
  function configure(item, index, forceLoad = false) {
    const video = item.video;
    item.index = index;
    item.source = item.sources[index] || '';
    if (!item.source) return false;
    video.muted = video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    if (forceLoad || video.getAttribute('src') !== item.source || video.error) {
      video.src = item.source;
      video.load();
    }
    return true;
  }
  function warm(item) {
    if (disabled() || item.visible) return;
    item.sources = candidates(item);
    const cached = item.sources.indexOf(item.source);
    // 只加载当前设备最合适的一个资源，不同时下载多种编码或桌面、手机两份。
    if (cached >= 0 && item.video.getAttribute('src') === item.source) return;
    if (configure(item, 0)) state(item, 'idle');
  }
  function begin(item, index = 0, forceLoad = false) {
    if (!item.visible || disabled()) return;
    invalidate(item);
    if (!configure(item, index, forceLoad)) { recover(item, 'error', '当前设备无法播放动画，已保留产品画面。'); return; }
    const request = item.request, video = item.video;
    state(item, 'loading');
    if (video.readyState >= 1 && video.currentTime !== 0) {
      try { video.currentTime = 0; } catch (_) { /* 首次元数据未完成时由 load 从头开始。 */ }
    }
    observeProgress(item);
    watch(item, request);
    let playback;
    try { playback = video.play(); } catch (error) { playback = Promise.reject(error); }
    Promise.resolve(playback).then(() => {
      if (request === item.request) observeProgress(item);
    }).catch(error => {
      if (request !== item.request || !current(item)) return;
      if (error?.name === 'NotAllowedError') {
        recover(item, 'blocked', '动画受浏览器播放设置限制，已保留产品画面。');
      } else if (error?.name === 'AbortError' && item.aborts++ < 1) {
        clearWatch(item);
        item.retry = setTimeout(() => {
          if (request === item.request && current(item)) begin(item, item.index, true);
        }, 160);
      } else nextSource(item);
    });
  }
  function playEntry(item) {
    item.sources = candidates(item);
    item.aborts = 0;
    item.pauses = 0;
    item.gestureUsed = false;
    const cached = item.sources.indexOf(item.source);
    begin(item, cached >= 0 ? cached : 0);
  }
  items.forEach(item => {
    ['playing', 'loadeddata', 'timeupdate'].forEach(name => item.video.addEventListener(name, () => observeProgress(item)));
    item.video.addEventListener('ended', () => finish(item));
    item.video.addEventListener('pause', () => {
      if (current(item) && item.video.paused && !item.video.ended && ['loading', 'playing'].includes(item.state)) {
        if (item.pauses++ === 0) {
          invalidate(item);
          state(item, 'loading');
          const request = item.request;
          item.retry = setTimeout(() => {
            if (request === item.request && current(item)) begin(item, item.index, true);
          }, 160);
        } else recover(item, 'blocked', '动画被系统暂停，已保留产品画面。');
      }
    });
    item.video.addEventListener('error', () => {
      if (current(item) && item.video.error && ['loading', 'playing'].includes(item.state)) nextSource(item);
    });
  });
  function resumeBlocked(event) {
    if (!event.isTrusted || disabled()) return;
    if (event.type === 'pointerup' && event.button !== undefined && event.button !== 0) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey
      || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(event.key))) return;
    items.forEach(item => {
      if (!item.visible || item.gestureUsed || !['blocked', 'error'].includes(item.state)) return;
      const rect = item.stage.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const sources = candidates(item);
      if (!sources.length) return;
      // 正常页面操作提供手势许可，只恢复受限动画；不创建按钮或给图片伪装点击操作。
      item.sources = sources;
      item.gestureUsed = true;
      item.aborts = item.pauses = 0;
      begin(item, 0, true);
    });
  }
  document.addEventListener('pointerup', resumeBlocked, { passive: true });
  document.addEventListener('keydown', resumeBlocked);
  function scan() {
    scanFrame = 0;
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    const top = Math.max(0, headerBottom), bottom = window.innerHeight || root.clientHeight;
    items.forEach(item => {
      const rect = item.stage.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
      const inView = visible > 0 && rect.right > 0 && rect.left < window.innerWidth;
      const threshold = Math.min(24, rect.height * .08);
      if (!inView || disabled()) {
        item.visible = false;
        if (item.state !== 'idle' || item.watch || item.retry || item.frame || item.decodedFrame) reset(item);
      } else if ((visible >= threshold || item.visible) && rect.height > 0) {
        const entering = !item.visible;
        item.visible = true;
        if (entering || item.state === 'idle') playEntry(item);
      }
      // 提前约一屏半预热相邻动画；远处场景、后台、减少动态与节省流量模式均不下载。
      const nearby = rect.bottom >= top - bottom * 1.5 && rect.top <= bottom * 2.5;
      if (!item.visible && nearby && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth) warm(item);
    });
  }
  function scheduleScan() {
    if (!scanFrame) scanFrame = requestAnimationFrame(scan);
  }
  function sync() {
    if (disabled()) {
      cancelAnimationFrame(scanFrame); scanFrame = 0;
      items.forEach(item => { item.visible = false; reset(item); });
    } else scheduleScan();
  }
  const listen = (query, callback) => query.addEventListener ? query.addEventListener('change', callback) : query.addListener(callback);
  window.addEventListener('scroll', scheduleScan, { passive: true });
  window.addEventListener('resize', scheduleScan, { passive: true });
  window.addEventListener('load', scheduleScan, { once: true });
  listen(mobile, () => { items.forEach(item => { item.visible = false; reset(item); }); sync(); });
  listen(reduced, sync);
  connection?.addEventListener?.('change', sync);
  new MutationObserver(scheduleScan).observe(root, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { suspended = true; sync(); });
  window.addEventListener('pageshow', () => {
    suspended = false;
    items.forEach(item => { item.visible = false; reset(item); });
    sync();
  });
  sync();
})();
