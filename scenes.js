/* 第四版滚动场景：只输出进度变量，图片的布局和变换由 CSS 负责。 */
(() => {
  'use strict';

  function installScenes() {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hasObserver = 'IntersectionObserver' in window;
    const definitions = [
      { section: '.ipados', stage: '.ipados-stage', property: '--os-progress' },
      { section: '.intelligence', stage: '.intelligence-art', property: '--ai-progress' },
      { section: '.performance', stage: '.performance-art', property: '--chip-progress' },
      // 采样未变换的外层，缩放图片不会反过来改变滚动进度。
      { section: '.pencil-story', stage: '.pencil-story', property: '--pencil-progress', rest: 0 }
    ];
    const scenes = definitions.flatMap(definition => {
      return [...document.querySelectorAll(definition.section)].map(section => ({
        section,
        stage: section.querySelector(definition.stage) || section,
        property: definition.property,
        rest: definition.rest ?? 1,
        nearby: !hasObserver,
        value: null
      }));
    });
    if (!scenes.length) return;

    let frame = 0;
    let suspended = false;
    let sampleAll = true;
    const clamp = value => Math.min(1, Math.max(0, value));
    const disabled = () => suspended || document.hidden || reducedMotion.matches || root.classList.contains('motion-off');

    function writeProgress(scene, value) {
      // 限制精度并跳过相同值，避免滚动时产生无意义的样式更新。
      const next = Math.round(value * 10000) / 10000;
      if (scene.value === next) return;
      scene.value = next;
      scene.section.style.setProperty(scene.property, String(next));
    }

    function showCompleteComposition() {
      cancelAnimationFrame(frame);
      frame = 0;
      scenes.forEach(scene => writeProgress(scene, scene.rest));
    }

    function draw() {
      frame = 0;
      if (disabled()) {
        showCompleteComposition();
        return;
      }
      const viewportHeight = Math.max(window.innerHeight, 1);

      // 先集中读取接近视口的媒体槽，再统一写入；不读取标题或正文高度。
      const positions = scenes.filter(scene => sampleAll || scene.nearby).map(scene => ({
        scene,
        rect: scene.stage.getBoundingClientRect()
      }));
      sampleAll = false;
      const updates = positions.map(({ scene, rect }) => {
        if (rect.height <= 0 || rect.width <= 0) return { scene, progress: 1 };
        // 媒体槽顶端进入视口底部时为 0，媒体中心到达视口中心时为 1。
        const linear = clamp((viewportHeight - rect.top) / ((viewportHeight + rect.height) / 2));
        // 两端平缓收速，避免产品刚出现或完全展开时突然停顿。
        return { scene, progress: linear * linear * (3 - 2 * linear) };
      });
      updates.forEach(({ scene, progress }) => writeProgress(scene, progress));
      // 不续订下一帧；原生滚动、观察器和尺寸变化才触发新的绘制。
    }

    function schedule() {
      if (disabled()) {
        showCompleteComposition();
      } else if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    }

    function requestLayout() {
      // 尺寸改变/缓存恢复时，观察器的可见状态可能还未刷新，先采样全部场景。
      sampleAll = true;
      schedule();
    }

    if (hasObserver) {
      const byStage = new Map(scenes.map(scene => [scene.stage, scene]));
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const scene = byStage.get(entry.target);
          if (scene) scene.nearby = entry.isIntersecting;
        });
        schedule();
      }, { rootMargin: '180px 0px', threshold: 0 });
      scenes.forEach(scene => observer.observe(scene.stage));
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', requestLayout, { passive: true });
    window.addEventListener('load', requestLayout, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) showCompleteComposition(); else requestLayout();
    });
    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', schedule);
    } else if (typeof reducedMotion.addListener === 'function') {
      reducedMotion.addListener(schedule);
    }
    if ('MutationObserver' in window) {
      new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });
    }

    // 其他章节的图片也可能改变当前场景的文档位置，加载事件统一在捕获阶段监听。
    document.addEventListener('load', event => {
      if (event.target instanceof HTMLImageElement) requestLayout();
    }, true);
    if ('ResizeObserver' in window) {
      // 只观察布局尺寸；进度变量仅改变子元素的 transform，不会反向触发尺寸循环。
      const observer = new ResizeObserver(requestLayout);
      scenes.forEach(scene => observer.observe(scene.stage));
      observer.observe(document.body);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(requestLayout, () => {});
    }

    // 隐藏页面立刻取消待绘制帧；从前进后退缓存恢复后重新计算当前画面。
    window.addEventListener('pagehide', () => {
      suspended = true;
      showCompleteComposition();
    });
    window.addEventListener('pageshow', () => {
      suspended = false;
      requestLayout();
    });

    // 暂停时保留完整产品构图；Pencil 恢复原尺寸。
    showCompleteComposition();
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installScenes, { once: true });
  } else {
    installScenes();
  }
})();
