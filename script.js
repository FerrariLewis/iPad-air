/* 原生 JavaScript，无框架/构建工具/在线依赖。直接打开 index.html 也可使用。 */
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 700px)');
  let motionOff = reducedMotion.matches;

  // 1. 手机菜单：支持点击、Escape、跳转后关闭、窗口变宽时复位。
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.getElementById('nav-links');
  function setMenu(open) {
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    navLinks.classList.toggle('is-open', open);
    navLinks.inert = mobile.matches && !open;
  }
  setMenu(false);
  menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuToggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) setMenu(false);
  });
  mobile.addEventListener('change', () => setMenu(false));

  // 2. 元素进入视口才播放一次入场效果，不支持观察器时直接显示。
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-reveal]').forEach(element => revealObserver.observe(element));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('is-visible'));
  }

  // 3. 重点区的图片动画、自动轮播和手动切换由 highlights.js 管理。

  // 4. 四种配色：按钮状态、图片可访问性与评论同时更新。
  const comments = {
    all: '所有颜色，只有四个',
    blue: '蓝色，是我看到 60Hz 的脸色',
    purple: '紫色，是我憋着没说完的那句话',
    starlight: '星光色，钱包里最后一点微光',
    gray: '深空灰色，是我冷静之后的心情'
  };
  document.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => {
      const selected = button.dataset.color;
      document.querySelectorAll('[data-color]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('[data-color-image]').forEach(image => {
        const active = image.dataset.colorImage === selected;
        image.classList.toggle('is-current', active);
        image.setAttribute('aria-hidden', String(!active));
      });
      document.getElementById('color-comment').textContent = comments[selected];
    });
  });

  // 5. 60Hz / 120Hz 是时间采样示意。实际呈现由访问设备刷新率限制。
  const demoButton = document.getElementById('demo-toggle');
  const demoStatus = document.getElementById('demo-status');
  const dots = [document.getElementById('dot-sixty'), document.getElementById('dot-onetwenty')];
  let demoPlaying = false;
  let demoVisible = false;
  let demoFrame = 0;
  let demoStart = 0;
  let demoWidth = 0;
  function stopDemo() {
    demoPlaying = false;
    cancelAnimationFrame(demoFrame);
    demoFrame = 0;
    demoButton.innerHTML = '播放示意 <span aria-hidden="true">▶</span>';
    demoButton.setAttribute('aria-pressed', 'false');
    demoStatus.textContent = '示意已暂停';
  }
  function renderDemo(time) {
    if (!demoPlaying) return;
    if (!demoStart) demoStart = time;
    const elapsed = (time - demoStart) / 1000;
    [60, 120].forEach((rate, index) => {
      const sampledTime = Math.floor(elapsed * rate) / rate;
      const position = (1 - Math.cos(sampledTime * Math.PI / 1.5)) / 2;
      dots[index].style.transform = `translateX(${position * demoWidth}px)`;
    });
    demoFrame = requestAnimationFrame(renderDemo);
  }
  demoButton.addEventListener('click', () => {
    if (demoPlaying) { stopDemo(); return; }
    if (motionOff) return;
    demoPlaying = true;
    demoStart = 0;
    demoWidth = dots[0].parentElement.clientWidth;
    demoButton.innerHTML = '暂停示意 <span aria-hidden="true">Ⅱ</span>';
    demoButton.setAttribute('aria-pressed', 'true');
    demoStatus.textContent = '示意正在播放';
    demoFrame = requestAnimationFrame(renderDemo);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      demoVisible = entries[0].isIntersecting;
      if (!demoVisible) stopDemo();
    }, { threshold: 0.15 }).observe(document.querySelector('.demo-panel'));
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopDemo(); });

  // 6. 第三版安全时间轴：标题 / 产品 / 正文各自占位，图片只在媒体槽内运动。
  const story = document.getElementById('display');
  const stage = story.querySelector('.refresh-stage');
  const refreshProduct = document.getElementById('refresh-product');
  const heroProduct = document.getElementById('hero-product');
  const hero = document.querySelector('.hero');
  hero.classList.add('is-entering');
  const progressBar = document.getElementById('reading-progress');
  const storyPanels = [...document.querySelectorAll('[data-story-panel]')];
  const storySteps = [...document.querySelectorAll('[data-story-step]')];
  const heroArt = document.getElementById('hero-art');
  const heroStage = document.querySelector('.hero-stage');
  const heroVideo = document.getElementById('hero-video');
  const heroTimeline = document.querySelector('.hero-timeline span');
  let activeStory = 0;
  let scrollFrame = 0;
  let suspended = false;
  let layoutDirty = true;
  let stickyTop = 72;
  let heroCurrent = 0;
  let storyCurrent = 0;
  let lastFrameTime = 0;
  let hasDrawn = false;
  let manualStory = null;
  let manualScrollPosition = 0;
  let staticStory = false;
  // iOS 地址栏伸缩会改变 innerHeight；短屏模式按稳定的小视口判定。
  const supportsSmallViewport = Boolean(window.CSS && CSS.supports('height', '100svh'));
  const viewportProbe = supportsSmallViewport ? document.createElement('div') : null;
  if (viewportProbe) {
    viewportProbe.setAttribute('aria-hidden', 'true');
    viewportProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none;contain:strict;';
    document.body.appendChild(viewportProbe);
  }
  let measuredViewportWidth = window.innerWidth;
  let fallbackViewportHeight = window.innerHeight;
  function stableViewportHeight() {
    if (viewportProbe) return viewportProbe.getBoundingClientRect().height || window.innerHeight;
    // 旧版触屏浏览器仅在宽度/方向改变时重采样，桌面仍支持自由调整窗口高度。
    if (!navigator.maxTouchPoints || Math.abs(window.innerWidth - measuredViewportWidth) > 1) {
      measuredViewportWidth = window.innerWidth;
      fallbackViewportHeight = window.innerHeight;
    }
    return fallbackViewportHeight;
  }
  const clamp = value => Math.min(1, Math.max(0, value));
  const mix = (start, end, progress) => start + (end - start) * progress;
  const smoothRange = (start, end, progress) => {
    const value = clamp((progress - start) / (end - start));
    return value * value * (3 - 2 * value);
  };
  function updateStoryPanels() {
    const showAll = motionOff || staticStory;
    storyPanels.forEach((panel, index) => {
      panel.classList.toggle('is-active', index === activeStory);
      panel.setAttribute('aria-hidden', String(!showAll && index !== activeStory));
    });
    storySteps.forEach((step, index) => {
      step.classList.toggle('is-active', index === activeStory);
      step.setAttribute('aria-pressed', String(index === activeStory));
    });
  }
  storySteps.forEach((button, index) => button.addEventListener('click', () => {
    manualStory = index;
    manualScrollPosition = window.scrollY;
    activeStory = index;
    updateStoryPanels();
  }));
  function fitMediaToSlots() {
    const wasStatic = staticStory;
    staticStory = stableViewportHeight() <= 660;
    root.classList.toggle('static-story', staticStory);
    stickyTop = parseFloat(getComputedStyle(root).getPropertyValue('--header-height')) || 72;
    const heroSlot = heroArt.getBoundingClientRect();
    const refreshSlot = story.querySelector('.refresh-art').getBoundingClientRect();
    demoWidth = dots[0].parentElement.clientWidth;
    // 预留约 12% 高度，吸收旋转、缩放及有限位移，图片不进入文字行。
    const ratio = 975 / 1215;
    const fitWidth = (slot, heightScale, widthScale, limit) => `${Math.max(1, Math.min(slot.height * ratio * heightScale, slot.width * widthScale, limit)).toFixed(2)}px`;
    const writeWidth = (element, property, value) => {
      if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
    };
    writeWidth(hero, '--hero-fit-width', fitWidth(heroSlot, .88, .84, mobile.matches ? 320 : 440));
    writeWidth(story, '--refresh-fit-width', fitWidth(refreshSlot, .84, .78, mobile.matches ? 260 : 350));
    if (staticStory) refreshProduct.style.transform = '';
    if (wasStatic !== staticStory) updateStoryPanels();
    layoutDirty = false;
    // 横竖屏切换后直接采样新布局，避免沿用旧视口的跟随进度。
    hasDrawn = false;
    lastFrameTime = 0;
  }
  function drawScroll(time) {
    scrollFrame = 0;
    if (suspended || document.hidden) return;
    if (layoutDirty) fitMediaToSlots();
    const viewport = window.innerHeight;
    const scrollY = window.scrollY;
    const total = document.documentElement.scrollHeight - viewport;
    const heroRect = hero.getBoundingClientRect();
    const rect = story.getBoundingClientRect();
    const heroTravel = heroRect.height - heroStage.offsetHeight;
    const heroTarget = heroTravel > 1 && !motionOff && !staticStory ? clamp((stickyTop - heroRect.top) / heroTravel) : 0;
    const travel = rect.height - stage.offsetHeight;
    const storyTarget = travel > 1 && !motionOff && !staticStory ? clamp((stickyTop - rect.top) / travel) : 0;
    // 本帧的滚动和尺寸读取完毕后，再统一提交变换。
    progressBar.style.transform = `scaleX(${total > 0 ? clamp(scrollY / total) : 0})`;
    const delta = lastFrameTime ? Math.min(.05, (time - lastFrameTime) / 1000) : .016;
    const follow = 1 - Math.exp(-delta * 18);
    lastFrameTime = time;
    if (!hasDrawn || motionOff) {
      heroCurrent = heroTarget;
      storyCurrent = storyTarget;
      hasDrawn = true;
    } else {
      heroCurrent = mix(heroCurrent, heroTarget, follow);
      storyCurrent = mix(storyCurrent, storyTarget, follow);
    }
    if (heroRect.top < viewport && heroRect.bottom > 0) {
      const handoff = smoothRange(.2, .75, heroCurrent);
      const headlineExit = smoothRange(.2, .39, heroCurrent);
      hero.style.setProperty('--hero-lift', `${mix(0, -10, handoff).toFixed(2)}px`);
      hero.style.setProperty('--hero-scale', mix(1, .96, handoff).toFixed(4));
      hero.style.setProperty('--hero-lockup-y', `${mix(0, -16, headlineExit).toFixed(2)}px`);
      hero.style.setProperty('--hero-lockup-scale', mix(1, .99, headlineExit).toFixed(4));
      hero.style.setProperty('--hero-lockup-opacity', (1 - headlineExit).toFixed(4));
      hero.style.setProperty('--hero-refrain-opacity', smoothRange(.46, .68, heroCurrent).toFixed(4));
      hero.style.setProperty('--hero-refrain-y', `${mix(18, 0, smoothRange(.46, .72, heroCurrent)).toFixed(2)}px`);
      hero.style.setProperty('--hero-wash-drift', `${mix(10, -14, heroCurrent).toFixed(2)}px`);
      hero.dataset.scene = heroCurrent < .39 ? 'opening' : (heroCurrent < .68 ? 'handoff' : 'refrain');
    }
    const progress = storyCurrent;
    if (manualStory !== null && Math.abs(scrollY - manualScrollPosition) > 18) manualStory = null;
    const index = manualStory !== null ? manualStory : Math.min(storyPanels.length - 1, Math.floor(progress * storyPanels.length));
    if (index !== activeStory) {
      activeStory = index;
      updateStoryPanels();
    }
    if (!motionOff && !staticStory && rect.top < viewport && rect.bottom > 0) {
      story.style.setProperty('--number-y', `${mix(12, -45, progress).toFixed(2)}px`);
      story.style.setProperty('--number-scale', mix(.94, 1.08, progress).toFixed(4));
      story.style.setProperty('--number-opacity', mix(.92, .58, progress).toFixed(4));
      refreshProduct.style.transform = `translateY(${mix(8,-10,progress)}px) rotate(${mix(2.5,-2.5,progress)}deg) scale(${mix(.96,1.025,progress)})`;
    }
    // 惯性只用于画面跟随，不阻止或接管浏览器原生滚动。
    if (!motionOff && (Math.abs(heroCurrent - heroTarget) > .0005 || Math.abs(storyCurrent - storyTarget) > .0005)) queueScroll();
  }
  function queueScroll() {
    if (!suspended && !document.hidden && !scrollFrame) scrollFrame = requestAnimationFrame(drawScroll);
  }
  function requestLayout() {
    layoutDirty = true;
    queueScroll();
  }
  function stopScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    lastFrameTime = 0;
    hasDrawn = false;
  }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', requestLayout, { passive: true });
  window.addEventListener('load', requestLayout, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestLayout, () => {});
  if ('ResizeObserver' in window) {
    const slotSizes = new WeakMap();
    const slotObserver = new ResizeObserver(entries => {
      let changed = false;
      entries.forEach(entry => {
        const previous = slotSizes.get(entry.target);
        const size = { width: entry.contentRect.width, height: entry.contentRect.height };
        slotSizes.set(entry.target, size);
        if (!previous || Math.abs(previous.width - size.width) > .5 || Math.abs(previous.height - size.height) > .5) changed = true;
      });
      // 观察器只排队，不在回调中改变被观察区域的尺寸。
      if (changed) requestLayout();
    });
    slotObserver.observe(heroArt);
    slotObserver.observe(story.querySelector('.refresh-art'));
  }

  // 同一段官网动画：Safari/iOS 使用 HEVC Alpha，其他浏览器使用 VP9 Alpha。
  // preload=none + 延迟赋 src，减弱动效/节省流量时不请求视频。
  let heroVisible = true;
  let heroAutoAttempted = false;
  let heroNeedsRestart = true;
  let videoFailed = false;
  // canPlayType(WebM) 不能检测 alpha。iPhone 上的 Chrome/Edge/Firefox 也要走 WebKit 分支。
  const iOSVideo = /iP(?:hone|ad|od)/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const preferHEVCHero = iOSVideo || (/AppleWebKit/i.test(navigator.userAgent)
    && !/(Chrome|Chromium|Edg|OPR|Android)/i.test(navigator.userAgent));
  let firstVideoFrame = 0;
  let heroPlayRequest = 0;
  let heroPlayPending = false;
  let heroWatchdog = 0;
  let heroSmaller = false;
  let heroReloadNeeded = false;
  let heroAutoBlocked = false;
  let heroGestureRetryUsed = false;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const heroReplay = document.getElementById('hero-replay');
  function syncHeroReplayAvailability() {
    if (heroReplay) heroReplay.disabled = motionOff || saveData || videoFailed;
  }
  function selectHeroSource() {
    const small = mobile.matches || heroSmaller;
    if (preferHEVCHero) {
      const supported = heroVideo.canPlayType('video/quicktime; codecs="hvc1"')
        || heroVideo.canPlayType('video/mp4; codecs="hvc1"') || heroVideo.canPlayType('video/quicktime');
      return supported ? (small ? heroVideo.dataset.mobileHevcSrc : heroVideo.dataset.desktopHevcSrc) : '';
    }
    return heroVideo.canPlayType('video/webm; codecs="vp9"')
      ? (small ? heroVideo.dataset.mobileSrc : heroVideo.dataset.desktopSrc) : '';
  }
  function cancelFirstFrame() {
    if (firstVideoFrame && heroVideo.cancelVideoFrameCallback) heroVideo.cancelVideoFrameCallback(firstVideoFrame);
    firstVideoFrame = 0;
  }
  function clearHeroWatchdog() {
    clearTimeout(heroWatchdog);
    heroWatchdog = 0;
  }
  function heroMayPresent(request) {
    return request === heroPlayRequest && !motionOff && !suspended && heroVisible && !document.hidden
      && heroVideo.getAttribute('src') === selectHeroSource();
  }
  function revealHeroFrame(request) {
    if (!heroMayPresent(request) || heroVideo.paused || heroVideo.ended || heroVideo.readyState < 2) return;
    cancelFirstFrame();
    hero.classList.add('has-video');
  }
  function showHeroStill() {
    heroPlayRequest += 1;
    heroPlayPending = false;
    clearHeroWatchdog();
    cancelFirstFrame();
    heroVideo.pause();
    hero.classList.remove('has-video');
    syncHeroReplayAvailability();
  }
  function restartHeroEntrance() {
    hero.classList.remove('is-entering');
    // 只在入场时刷新动画，保持滚动绘制过程中不强制布局。
    void hero.offsetWidth;
    hero.classList.add('is-entering');
  }
  function recoverHero(request, permanentFailure = false) {
    if (!heroMayPresent(request)) return;
    showHeroStill();
    heroReloadNeeded = true;
    // 桌面原片接近 4K；解码失败或真实媒体时钟停止时，试一次同格式的小规格原片。
    // Safari 仍保留 HEVC Alpha，不能回退成可能显示黑底的透明 WebM。
    const smallerSource = preferHEVCHero ? heroVideo.dataset.mobileHevcSrc : heroVideo.dataset.mobileSrc;
    if (!mobile.matches && !heroSmaller && smallerSource) {
      heroSmaller = true;
      heroAutoBlocked = false;
      playHero(true);
    } else {
      heroAutoBlocked = !permanentFailure;
      videoFailed = permanentFailure;
      syncHeroReplayAvailability();
    }
  }
  function watchHero(request) {
    clearHeroWatchdog();
    let previousTime = heroVideo.currentTime || 0;
    let lastProgressAt = performance.now();
    let hasProgress = false;
    const check = () => {
      heroWatchdog = 0;
      if (!heroMayPresent(request) || heroVideo.ended) return;
      const current = heroVideo.currentTime || 0;
      if (current > previousTime + .005) {
        previousTime = current;
        lastProgressAt = performance.now();
        hasProgress = true;
        revealHeroFrame(request);
      }
      // playing 之后仍可能缓冲/被系统暂停，持续检查真实时钟，不能以播放 Promise 代替进度。
      if (performance.now() - lastProgressAt >= (hasProgress ? 6000 : 12000)) {
        recoverHero(request);
        return;
      }
      heroWatchdog = setTimeout(check, 500);
    };
    heroWatchdog = setTimeout(check, 500);
  }
  async function playHero(fromStart = false) {
    if (motionOff || suspended || document.hidden || videoFailed) return;
    if (!fromStart && (heroPlayPending || (!heroVideo.paused && !heroVideo.ended))) return;
    clearHeroWatchdog();
    const request = ++heroPlayRequest;
    const source = selectHeroSource();
    if (!source) {
      videoFailed = true;
      heroAutoBlocked = false;
      showHeroStill();
      return;
    }
    if (heroVideo.getAttribute('src') !== source || heroVideo.error || heroReloadNeeded) {
      cancelFirstFrame();
      hero.classList.remove('has-video');
      heroVideo.src = source;
      heroVideo.muted = true;
      heroVideo.defaultMuted = true;
      heroVideo.playsInline = true;
      hero.dataset.heroFormat = preferHEVCHero ? 'hevc-alpha' : 'webm-alpha';
      heroVideo.load();
      heroReloadNeeded = false;
    }
    if (fromStart) {
      heroTimeline.style.transform = 'scaleX(0)';
      restartHeroEntrance();
      // 新载入的源自然从 0 开始，避免 Safari 在 metadata 前 seek 抛异常。
      if (heroVideo.readyState >= 1) heroVideo.currentTime = 0;
    }
    heroPlayPending = true;
    watchHero(request);
    try {
      await heroVideo.play();
      if (request === heroPlayRequest) {
        heroPlayPending = false;
      }
    } catch (error) {
      // 换源/暂停中止的旧 Promise 不能再暂停刚启动的新视频。
      if (request !== heroPlayRequest) return;
      heroPlayPending = false;
      // load/seek 的 AbortError 不等于用户禁播；若确实没有推进，由有界时钟恢复。
      if (error.name === 'AbortError') return;
      if (error.name === 'NotSupportedError') { recoverHero(request, true); return; }
      showHeroStill();
      heroAutoBlocked = true;
      if (error.name !== 'NotAllowedError') heroReloadNeeded = true;
      // 自动播放被拦截时保留首图；页面手势与首页的独立圆球均能同步发起恢复。
    }
  }
  function maybePlayHero() {
    if (motionOff || suspended || !heroVisible || document.hidden) return;
    // 蓝色胶囊的入场独立于视频，即使省流量或解码不可用也能展开。
    if (heroNeedsRestart && (saveData || videoFailed || heroAutoBlocked)) {
      restartHeroEntrance();
      heroNeedsRestart = false;
    }
    if (videoFailed || heroAutoBlocked) return;
    if ((!heroAutoAttempted || heroNeedsRestart) && !saveData) {
      heroAutoAttempted = true;
      heroNeedsRestart = false;
      playHero(true);
    } else if (heroAutoAttempted && heroVideo.currentTime > 0 && !heroVideo.ended) {
      playHero();
    }
  }
  heroVideo.addEventListener('playing', () => {
    if (!heroMayPresent(heroPlayRequest) || heroVideo.paused || heroVideo.ended) return;
    cancelFirstFrame();
    const request = heroPlayRequest;
    // 先等解码首帧，再移走底图，避免 Safari 播放事件早于画面时闪空。
    if (heroVideo.requestVideoFrameCallback) {
      let callback = 0;
      callback = heroVideo.requestVideoFrameCallback(() => {
        if (firstVideoFrame === callback) firstVideoFrame = 0;
        if (request === heroPlayRequest) revealHeroFrame(request);
      });
      firstVideoFrame = callback;
    } else revealHeroFrame(request);
  });
  // 透明影片在 opacity:0 时，部分浏览器不提交 rVFC；已解码数据和真实时间推进也可解除首图。
  heroVideo.addEventListener('loadeddata', () => revealHeroFrame(heroPlayRequest));
  heroVideo.addEventListener('timeupdate', () => {
    if (heroVideo.currentTime > .01) revealHeroFrame(heroPlayRequest);
    if (Number.isFinite(heroVideo.duration) && heroVideo.duration > 0) heroTimeline.style.transform = `scaleX(${clamp(heroVideo.currentTime / heroVideo.duration)})`;
  });
  heroVideo.addEventListener('ended', () => {
    if (!heroVideo.ended || !heroMayPresent(heroPlayRequest)) return;
    clearHeroWatchdog();
    cancelFirstFrame();
    heroPlayPending = false;
    // 保持视频最后一帧，避免末帧与图片裁切略有差异时跳动。
    if (!motionOff && !suspended && heroVisible && !document.hidden) hero.classList.add('has-video');
    heroTimeline.style.transform = 'scaleX(1)';
  });
  heroVideo.addEventListener('error', () => {
    if (!heroVideo.error || !heroMayPresent(heroPlayRequest)) return;
    if (heroVideo.error?.code === 3 || heroVideo.error?.code === 4) {
      recoverHero(heroPlayRequest, true);
      return;
    }
    // 网络错误允许下一次真实页面手势或首页圆球重试，底图始终可读。
    showHeroStill();
    heroReloadNeeded = true;
    heroAutoBlocked = true;
    videoFailed = false;
  });
  function retryHeroOnGesture(event) {
    if (!event.isTrusted || !heroAutoBlocked || heroGestureRetryUsed || videoFailed || saveData
      || motionOff || suspended || !heroVisible || document.hidden || heroVideo.ended) return;
    // 圆球由自己的 click 处理，不能让 pointerup / Enter 冒泡先发起一次隐式恢复。
    if (event.target?.closest?.('#hero-replay')) return;
    if (event.type === 'pointerup' && event.button !== undefined && event.button !== 0) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey
      || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(event.key))) return;
    heroGestureRetryUsed = true;
    heroAutoAttempted = true;
    heroNeedsRestart = false;
    heroAutoBlocked = false;
    // play() 必须留在当前手势调用栈中，才能恢复 iOS 低电量等策略限制的自动播放。
    playHero(true);
  }
  document.addEventListener('pointerup', retryHeroOnGesture, { passive: true });
  document.addEventListener('keydown', retryHeroOnGesture);
  heroReplay?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (motionOff || saveData || suspended || !heroVisible || document.hidden || videoFailed) return;
    // 先使旧 Promise、首帧回调和真实时钟监测失效，再从 0 开始。保留同一个按钮节点与焦点。
    showHeroStill();
    heroAutoAttempted = true;
    heroNeedsRestart = false;
    heroAutoBlocked = false;
    heroGestureRetryUsed = false;
    playHero(true);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      const wasVisible = heroVisible;
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) {
        if (!wasVisible) { heroNeedsRestart = true; heroAutoAttempted = false; heroAutoBlocked = false; heroGestureRetryUsed = false; }
        maybePlayHero();
      } else {
        heroNeedsRestart = true;
        showHeroStill();
      }
    }, { threshold: 0.2 }).observe(heroStage);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      heroNeedsRestart = true;
      heroAutoAttempted = false;
      showHeroStill();
      stopScroll();
    } else {
      requestLayout();
      heroAutoBlocked = false;
      heroGestureRetryUsed = false;
      maybePlayHero();
    }
  });
  mobile.addEventListener('change', () => {
    const intendedPlayback = !heroVideo.paused && !heroVideo.ended;
    if (heroVideo.getAttribute('src')) {
      showHeroStill();
      heroVideo.removeAttribute('src');
      heroVideo.load();
      heroAutoBlocked = false;
      heroGestureRetryUsed = false;
      if (intendedPlayback && !motionOff && heroVisible) playHero();
    }
    requestLayout();
  });

  // 7. 全站动效开关已移除，只遵循系统减少动态效果偏好。内容始终可读。
  function applyMotionPreference() {
    motionOff = reducedMotion.matches;
    root.classList.toggle('motion-off', motionOff);
    demoButton.disabled = motionOff;
    syncHeroReplayAvailability();
    if (motionOff) {
      heroNeedsRestart = true;
      heroAutoAttempted = false;
      stopDemo();
      showHeroStill();
      heroProduct.style.transform = '';
      refreshProduct.style.transform = '';
    } else {
      heroAutoBlocked = false;
      heroGestureRetryUsed = false;
      maybePlayHero();
    }
    updateStoryPanels();
    requestLayout();
  }
  reducedMotion.addEventListener('change', applyMotionPreference);

  // 离开页面时取消待绘制帧；返回缓存页面后按恢复的滚动位置重新采样。
  window.addEventListener('pagehide', () => {
    suspended = true;
    heroNeedsRestart = true;
    heroAutoAttempted = false;
    stopScroll();
    stopDemo();
    showHeroStill();
  });
  window.addEventListener('pageshow', () => {
    suspended = false;
    heroAutoBlocked = false;
    heroGestureRetryUsed = false;
    requestLayout();
    maybePlayHero();
  });

  // 8. 导航高亮，只标记当前最靠近顶部的内容板块。
  const navTargets = ['highlights', 'colors', 'performance', 'intelligence', 'verdict'];
  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.querySelectorAll('a').forEach(link => link.classList.toggle('is-active', link.hash === '#' + entry.target.id));
        }
      });
    }, { rootMargin: '-10% 0px -60% 0px', threshold: 0 });
    navTargets.forEach(id => navObserver.observe(document.getElementById(id)));
  }
  applyMotionPreference();
})();
