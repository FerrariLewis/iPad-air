/* 两种身量：官方机身图预解码后，以轻旋转和平移切换。 */
(() => {
  'use strict';
  const art = document.getElementById('size-art');
  const composition = document.getElementById('size-composition');
  const status = document.getElementById('size-status');
  const picker = document.querySelector('.size-picker');
  if (!art || !composition || !picker || !status) return;
  const buttons = [...picker.querySelectorAll('[data-size-choice]')];
  const images = [...composition.querySelectorAll('[data-size-image]')];
  const films = [...composition.querySelectorAll('[data-size-video]')];
  const imageFor = new Map(images.map(image => [image.dataset.sizeImage, image]));
  const filmFor = new Map(films.map(video => [video.dataset.sizeVideo, video]));
  if (!buttons.length || !imageFor.size) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const pendingDecodes = new Map();
  const decodedImages = new Set();
  const presentedTimes = new Map();
  let active = imageFor.has(art.dataset.size) ? art.dataset.size : images[0].dataset.sizeImage;
  let painted = active;
  let desired = active;
  let sequence = 0;
  let suspended = false;
  let filmRun = null;
  let shownFilm = null;
  let inView = true;

  const quiet = () => suspended || document.hidden || reduced.matches || root.classList.contains('motion-off');
  const saveData = () => typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData;
  function syncMotion() {
    art.classList.toggle('is-instant', quiet());
    if (quiet() || saveData()) stopFilms();
  }
  function clearPending() {
    composition.removeAttribute('aria-busy');
    delete art.dataset.pendingSize;
  }
  function ready(image) {
    if (decodedImages.has(image)) return Promise.resolve(true);
    if (pendingDecodes.has(image)) return pendingDecodes.get(image);
    // Lazy images outside the initial viewport are fetched only near this section or on selection.
    image.loading = 'eager';
    let promise;
    if (typeof image.decode === 'function') {
      try {
        promise = Promise.resolve(image.decode()).then(() => image.naturalWidth > 0,
          () => image.complete && image.naturalWidth > 0);
      } catch (_) { promise = Promise.resolve(image.complete && image.naturalWidth > 0); }
    } else if (image.complete) {
      promise = Promise.resolve(image.naturalWidth > 0);
    } else {
      promise = new Promise(resolve => {
        function finish() {
          image.removeEventListener('load', finish);
          image.removeEventListener('error', finish);
          resolve(image.complete && image.naturalWidth > 0);
        }
        image.addEventListener('load', finish);
        image.addEventListener('error', finish);
      });
    }
    pendingDecodes.set(image, promise);
    promise.then(ok => {
      pendingDecodes.delete(image);
      if (ok) decodedImages.add(image);
    });
    return promise;
  }
  function paintImages(size) {
    painted = size;
    images.forEach(image => {
      const selected = image.dataset.sizeImage === size;
      image.classList.toggle('is-current', selected);
      image.setAttribute('aria-hidden', String(!selected));
    });
  }
  function markCurrent(size, updateImage = true) {
    active = size;
    art.dataset.size = size;
    if (updateImage) paintImages(size);
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sizeChoice === size)));
    composition.setAttribute('aria-label', `${size} 英寸 iPad Air 正反面`);
    status.textContent = `${size} 英寸机型`;
    clearPending();
  }
  function prime(video) {
    if (!video || saveData()) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (!video.getAttribute('src') && video.dataset.src) {
      video.setAttribute('src', video.dataset.src);
      try { video.load(); } catch (_) { /* 静帧始终保留。 */ }
    }
  }
  function retireRun() {
    const run = filmRun;
    filmRun = null;
    if (!run) return;
    cancelAnimationFrame(run.frame);
    if (run.video.cancelVideoFrameCallback && run.videoFrame) {
      try { run.video.cancelVideoFrameCallback(run.videoFrame); } catch (_) {}
    }
    run.events.forEach(([name, callback]) => run.video.removeEventListener(name, callback));
    try { run.video.pause(); } catch (_) {}
  }
  function stopFilms() {
    retireRun();
    films.forEach(video => {
      video.classList.remove('is-visible');
      try { video.pause(); } catch (_) {}
    });
    shownFilm = null;
    paintImages(active);
    art.classList.remove('has-size-film');
    delete art.dataset.rotating;
  }
  function frameGeometry(video) {
    const count = Number(video.dataset.frameCount), rate = Number(video.dataset.frameRate);
    return Number.isInteger(count) && count > 1 && Number.isFinite(rate) && rate > 0
      ? { count, rate, last: (count - 1) / rate } : null;
  }
  function rotate(size) {
    const video = filmFor.get(size);
    if (!video || quiet() || saveData() || !inView) { stopFilms(); return; }
    const previous = shownFilm;
    if (!previous && painted === size) { stopFilms(); return; }
    // 暂停在已经呈现的那一帧；新方向的镜头先 seek、解码，随后才覆盖它。
    let fraction = 0;
    if (previous && Number.isFinite(previous.duration) && previous.duration > 0) {
      const geometry = frameGeometry(previous);
      const time = presentedTimes.has(previous) ? presentedTimes.get(previous) : previous.currentTime;
      // 129 帧影片的最后一帧在 128/30 秒；duration 还包含末帧的显示时间。
      // 用已显示的帧号映射反向影片，避免中途切向时偏移一帧。
      const frame = geometry ? Math.min(geometry.count - 1, Math.max(0, Math.floor(time * geometry.rate + .001))) : 0;
      const progress = geometry ? frame / (geometry.count - 1) : Math.min(1, Math.max(0, time / previous.duration));
      fraction = previous === video ? progress : 1 - progress;
    }
    retireRun();
    if (previous) { try { previous.pause(); } catch (_) {} }
    presentedTimes.delete(video);
    prime(video);
    const now = performance.now();
    const run = { video, events: [], frame: 0, videoFrame: 0, aligned: false, playing: false,
      started: now, lastAdvance: now, lastTime: NaN, startTime: 0, visible: false };
    filmRun = run;
    art.dataset.rotating = size;
    const live = () => filmRun === run;
    function on(name, callback) { video.addEventListener(name, callback); run.events.push([name, callback]); }
    function finish() {
      if (!live()) return;
      // 相应端帧已完成解码并在影片下面，不依赖影片停留最后一帧的浏览器差异。
      stopFilms();
    }
    function showFrame(presentedTime) {
      if (!live() || quiet() || video.seeking || video.readyState < 2 || !run.playing) return;
      if (Number.isFinite(presentedTime)) presentedTimes.set(video, presentedTime);
      run.visible = true;
      art.classList.add('has-size-film');
      paintImages(active);
      films.forEach(film => film.classList.toggle('is-visible', film === video));
      shownFilm = video;
    }
    function requestDecodedFrame() {
      if (!video.requestVideoFrameCallback) return;
      try {
        run.videoFrame = video.requestVideoFrameCallback((_, metadata) => {
          run.videoFrame = 0;
          if (!live()) return;
          showFrame(metadata?.mediaTime);
          requestDecodedFrame();
        });
      } catch (_) { /* timeupdate/真实时间推进仍可显示首帧。 */ }
    }
    function play() {
      if (!live() || run.playing || video.seeking) return;
      run.playing = true;
      run.lastTime = video.currentTime;
      run.lastAdvance = performance.now();
      let result;
      try { result = video.play(); } catch (_) { finish(); return; }
      if (result && typeof result.catch === 'function') result.catch(() => { if (live()) finish(); });
      requestDecodedFrame();
    }
    function align() {
      if (!live() || run.aligned || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) return;
      run.aligned = true;
      const geometry = frameGeometry(video);
      run.startTime = geometry
        ? Math.min(geometry.last, Math.round((geometry.count - 1) * fraction) / geometry.rate)
        : Math.min(Math.max(0, video.duration - .04), video.duration * fraction);
      if (Math.abs(video.currentTime - run.startTime) > .025) {
        try { video.currentTime = run.startTime; } catch (_) { finish(); return; }
      }
      if (!video.seeking) play();
    }
    function progress() {
      if (!live()) return;
      if (video.ended) { finish(); return; }
      const time = video.currentTime;
      if (Number.isFinite(time) && Number.isFinite(run.lastTime) && time > run.lastTime + .008) {
        run.lastAdvance = performance.now();
        run.lastTime = time;
        showFrame();
      }
    }
    function watch() {
      if (!live()) return;
      if (quiet()) { finish(); return; }
      align();
      progress();
      if (!live()) return;
      const elapsed = performance.now();
      if ((!run.visible && elapsed - run.started > 4000) || (run.visible && elapsed - run.lastAdvance > 2200)) { finish(); return; }
      run.frame = requestAnimationFrame(watch);
    }
    on('loadedmetadata', align);
    on('canplay', () => { align(); if (run.aligned) play(); });
    on('seeked', () => { if (live() && run.aligned) play(); });
    on('timeupdate', progress);
    on('ended', () => {
      // 同一个 video 再次使用时，忽略先前那次播放排队中的 ended。
      if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - .06)) finish();
    });
    on('error', () => { if (video.error) finish(); });
    align();
    if (video.error) finish();
    if (live()) run.frame = requestAnimationFrame(watch);
  }
  function choose(size) {
    if (!imageFor.has(size)) return;
    desired = size;
    const ticket = ++sequence;
    syncMotion();
    if (size === active) { clearPending(); return; }
    composition.setAttribute('aria-busy', 'true');
    art.dataset.pendingSize = size;
    ready(imageFor.get(size)).then(ok => {
      if (ticket !== sequence || size !== desired) return;
      if (!ok) {
        clearPending();
        desired = active;
        status.textContent = `${active} 英寸机型；所选图片暂时无法载入`;
        return;
      }
      // A queued decode must never change the scene after it has been put in the background.
      if (suspended || document.hidden) return;
      const useFilm = filmFor.has(size) && !quiet() && !saveData();
      markCurrent(size, !useFilm);
      rotate(size);
    });
  }
  buttons.forEach(button => button.addEventListener('click', () => choose(button.dataset.sizeChoice)));
  picker.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (current + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index].focus();
    choose(buttons[index].dataset.sizeChoice);
  });
  function warm() {
    images.forEach(image => { ready(image); });
    if (!quiet() && !saveData()) films.forEach(prime);
  }
  if ('IntersectionObserver' in window) {
    try {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        warm();
        observer.disconnect();
      }, { rootMargin: '360px 0px', threshold: 0 });
      observer.observe(art);
      const visibility = new IntersectionObserver(entries => {
        const entry = entries.find(item => item.target === composition);
        if (!entry) return;
        inView = entry.isIntersecting;
        if (!inView) stopFilms();
      }, { threshold: 0 });
      visibility.observe(composition);
    } catch (_) { warm(); }
  } else { warm(); }
  reduced.addEventListener('change', syncMotion);
  new MutationObserver(syncMotion).observe(root, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => {
    syncMotion();
    if (!document.hidden && !suspended && desired !== active) choose(desired);
  });
  window.addEventListener('pagehide', () => {
    suspended = true;
    ++sequence;
    clearPending();
    syncMotion();
  });
  window.addEventListener('pageshow', () => {
    suspended = false;
    syncMotion();
    if (desired !== active) choose(desired);
  });
  markCurrent(active);
  syncMotion();
})();
