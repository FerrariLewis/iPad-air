/* 第三版细节动效：只移动图片，不修改容器、正文或 data-reveal 的变换。 */
(() => {
  'use strict';

  function installImageEffects() {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const configurations = [
      { selector: '.performance-art img', rotation: 0.6, pointer: false },
      // 尺寸影片和静帧共享一个变换层，避免图片单独倾斜后与影片错位。
      { selector: '.size-art .size-composition', rotation: 0.45, pointer: true },
      { selector: '.accessory-art img', rotation: 0.55, pointer: true }
    ];
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    let frame = 0;
    let suspended = false;
    let layoutDirty = true;

    const items = configurations.flatMap(configuration => {
      return [...document.querySelectorAll(configuration.selector)].filter(image => !image.closest('[data-section-media]')).map(image => ({
        ...configuration,
        image,
        target: image.parentElement,
        nearby: !('IntersectionObserver' in window),
        pointerX: 0,
        pointerY: 0,
        pointerPosition: null,
        baseTransform: '',
        // 暂停时恢复原本的行内样式，让 CSS 的静态构图继续生效。
        originalTransform: image.style.transform,
        originalWillChange: image.style.willChange
      }));
    });
    if (!items.length) return;

    const disabled = () => suspended || document.hidden || reducedMotion.matches || root.classList.contains('motion-off');

    function restore(item) {
      item.image.style.transform = item.originalTransform;
      item.image.style.willChange = item.originalWillChange;
    }

    function clearEffects() {
      cancelAnimationFrame(frame);
      frame = 0;
      items.forEach(item => {
        item.pointerX = 0;
        item.pointerY = 0;
        item.pointerPosition = null;
        restore(item);
      });
    }

    function readBaseTransforms() {
      // 读取 CSS 原有角度，避免性能图的静态旋转被增强动画覆盖。
      items.forEach(restore);
      items.forEach(item => {
        const transform = getComputedStyle(item.image).transform;
        item.baseTransform = transform === 'none' ? '' : transform;
      });
    }

    function draw() {
      frame = 0;
      if (disabled()) {
        clearEffects();
        return;
      }
      if (layoutDirty) {
        readBaseTransforms();
        layoutDirty = false;
      }
      const viewportHeight = window.innerHeight;

      // 先读取所有几何信息，再写样式；只为接近屏幕的图片更新变换。
      const positions = items.map(item => ({ item, rect: item.target.getBoundingClientRect() }));
      positions.forEach(({ item, rect }) => {
        const withinRange = rect.height > 0 && rect.bottom > -120 && rect.top < viewportHeight + 120;
        if (!item.nearby || !withinRange) {
          item.pointerX = 0;
          item.pointerY = 0;
          item.pointerPosition = null;
          restore(item);
          return;
        }

        const halfRange = (viewportHeight + rect.height) / 2;
        const progress = clamp((viewportHeight / 2 - rect.top - rect.height / 2) / halfRange, -1, 1);
        // 位移最多 10px，缩放最多 1.032；留出额外余量保护相邻文字。
        const offsetY = -progress * 10;
        const scale = 1.012 + (1 - Math.abs(progress)) * 0.02;
        const angle = progress * item.rotation;
        if (item.pointerPosition && rect.width > 0) {
          item.pointerX = clamp((item.pointerPosition.x - rect.left) / rect.width * 2 - 1, -1, 1);
          item.pointerY = clamp((item.pointerPosition.y - rect.top) / rect.height * 2 - 1, -1, 1);
        }
        const tiltX = finePointer.matches && item.pointer ? -item.pointerY * 1.2 : 0;
        const tiltY = finePointer.matches && item.pointer ? item.pointerX * 1.2 : 0;
        item.image.style.willChange = 'transform';
        item.image.style.transform = [
          `translate3d(0, ${offsetY.toFixed(2)}px, 0)`,
          item.baseTransform,
          'perspective(1000px)',
          `rotateX(${tiltX.toFixed(2)}deg)`,
          `rotateY(${tiltY.toFixed(2)}deg)`,
          `rotateZ(${angle.toFixed(2)}deg)`,
          `scale(${scale.toFixed(4)})`
        ].filter(Boolean).join(' ');
      });
      // 不在这里再次请求下一帧：只在滚动、指针或尺寸变化时绘制。
    }

    function schedule() {
      if (disabled()) {
        clearEffects();
      } else if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    }

    function requestLayout() {
      layoutDirty = true;
      schedule();
    }

    if ('IntersectionObserver' in window) {
      const nearViewport = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          items.forEach(item => {
            if (item.target === entry.target) item.nearby = entry.isIntersecting;
          });
        });
        schedule();
      }, { rootMargin: '120px 0px', threshold: 0 });
      items.forEach(item => nearViewport.observe(item.target));
    }

    items.filter(item => item.pointer).forEach(item => {
      item.target.addEventListener('pointermove', event => {
        if (disabled() || !finePointer.matches || !item.nearby || event.pointerType === 'touch') return;
        // 触控笔/鼠标可能每帧发送多次事件，只保留最后坐标，在绘制帧统一测量。
        item.pointerPosition = { x: event.clientX, y: event.clientY };
        schedule();
      }, { passive: true });
      const resetPointer = () => {
        item.pointerX = 0;
        item.pointerY = 0;
        item.pointerPosition = null;
        schedule();
      };
      item.target.addEventListener('pointerleave', resetPointer, { passive: true });
      item.target.addEventListener('pointercancel', resetPointer, { passive: true });
    });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', requestLayout, { passive: true });
    window.addEventListener('load', requestLayout, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearEffects(); else requestLayout();
    });
    reducedMotion.addEventListener('change', schedule);
    finePointer.addEventListener('change', () => {
      items.forEach(item => { item.pointerX = 0; item.pointerY = 0; item.pointerPosition = null; });
      schedule();
    });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });

    // 浏览器前进后退缓存恢复时重建画面，离开页面时立即释放变换。
    window.addEventListener('pagehide', () => { suspended = true; clearEffects(); });
    window.addEventListener('pageshow', () => { suspended = false; requestLayout(); });

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      items.forEach(item => observer.observe(item.target));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestLayout, () => {});

    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installImageEffects, { once: true });
  } else {
    installImageEffects();
  }
})();
