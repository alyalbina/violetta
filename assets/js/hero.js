/* ==========================================================================
   Hero — движение.

   Сцена сохранена; смысловые пары меняются одним блоком. Уменьшение движения и низкое
   окно включают статичную композицию; ручная пауза останавливает фон и слова.
   ========================================================================== */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var shortViewport = window.matchMedia("(max-height: 650px)");

  var paused = false;
  var staticScene = false;
  var frameId = null;
  var wordTimer = null;
  var phaseTimers = [];
  var lastTick = null;
  var lastPaint = 0;
  var renderedProgress = null;
  var renderedStatic = null;
  var animationStopped = false;

  var WORDS = [["расскажет вашу", "историю"], ["превратит чувства", "в музыку"], ["скажет главное", "за вас"], ["останется с вами", "навсегда"]];
  var STAR_COUNT = 46;
  var CYCLE = 3400; // цикл: около 3 секунд покоя и 440 мс перехода
  var OUT = 200;    // мягкий уход вверх
  var IN = 220;     // мягкий возврат снизу

  // 0 — слово на месте, 1 — уходит вверх, 2 — мгновенно переставлено вниз
  var PHASES = [
    { o: 1, y: 0, sc: 1, blur: 0, ms: IN, ease: "cubic-bezier(.22,.9,.24,1)" },
    { o: 0, y: -6, sc: 1, blur: 0, ms: OUT, ease: "cubic-bezier(.5,0,.75,0)" },
    { o: 0, y: 6, sc: 1, blur: 0, ms: 0, ease: "linear" }
  ];

  // Хеш-рандом: раскладка звёзд одинакова при каждой загрузке.
  function rnd(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  var el = {
    hero: document.querySelector(".hero"),
    motion: document.getElementById("hero-motion"),
    brand: document.querySelector(".nav__brand"),
    sky: document.getElementById("hero-sky"),
    starHost: document.getElementById("hero-stars"),
    cloudA: document.getElementById("hero-cloud-a"),
    cloudB: document.getElementById("hero-cloud-b"),
    cloudC: document.getElementById("hero-cloud-c"),
    bank2: document.getElementById("hero-bank-2"),
    bank3: document.getElementById("hero-bank-3"),
    content: document.getElementById("hero-content"),
    word: document.getElementById("hero-word"),
    script: document.getElementById("hero-script"),
    ending: document.getElementById("hero-ending")
  };

  if (Object.keys(el).some(function (key) { return !el[key]; })) return;
  document.documentElement.classList.add("hero-enhanced");

  var state = { wordIndex: 0, phase: 0, p: 0, t: 0 };

  /* ---- звёзды ---------------------------------------------------------- */

  var seeds = [];
  var starNodes = [];

  (function buildStars() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < STAR_COUNT; i++) {
      var a = rnd(i + 1);
      var b = rnd(i * 3.7 + 9.2);
      var c = rnd(i * 7.3 + 21.5);
      var seed = {
        x: (a * 100).toFixed(2),
        // Степень < 1.5 уплотняет звёзды к верху неба.
        y: (1 + Math.pow(b, 1.35) * 52).toFixed(2),
        s: (1.1 + c * 1.9).toFixed(2),
        ph: rnd(i * 11.9 + 4.4) * 6.283,
        sp: 0.35 + rnd(i * 5.1 + 2.2) * 0.75,
        base: 0.12 + rnd(i * 2.9 + 13.1) * 0.2
      };
      seeds.push(seed);

      var node = document.createElement("span");
      node.className = "hero__star";
      node.style.left = seed.x + "%";
      node.style.top = seed.y + "%";
      node.style.width = seed.s + "px";
      node.style.height = seed.s + "px";
      frag.appendChild(node);
      starNodes.push(node);
    }
    el.starHost.appendChild(frag);
  })();

  /* ---- кадр ------------------------------------------------------------ */

  function render() {
    var t = state.t;
    var p = 0; // The scene no longer transforms in response to scrolling.
    renderedProgress = state.p;
    renderedStatic = staticScene;

    // Тизер второго экрана проявляется во второй половине скролла.
    // Ночная часть сцены гаснет по мере подъёма закатных слоёв.
    var dim = 1 - Math.min(1, p * 1.4);

    for (var i = 0; i < starNodes.length; i++) {
      var s = seeds[i];
      starNodes[i].style.opacity = (
        (s.base + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * s.sp + s.ph), 2.2)) * dim
      ).toFixed(3);
    }

    el.cloudA.style.opacity = (0.5 * dim).toFixed(3);
    el.cloudB.style.opacity = (0.46 * dim).toFixed(3);
    el.cloudC.style.opacity = (0.42 * dim).toFixed(3);

    // Горизонтальный дрейф: разные периоды и амплитуды у каждого облака.
    el.cloudA.style.transform =
      "translate3d(" + (Math.sin(t / 15) * 8).toFixed(1) + "px, " +
      (Math.sin(t / 19) * 2).toFixed(1) + "px, 0)";
    el.cloudB.style.transform =
      "translate3d(" + (Math.sin(t / 18 + 2) * -9).toFixed(1) + "px, " +
      (Math.sin(t / 21 + 1) * 2).toFixed(1) + "px, 0)";
    el.cloudC.style.transform =
      "translate3d(" + (Math.sin(t / 22 + 4) * -6).toFixed(1) + "px, " +
      (Math.sin(t / 24 + 3) * 2).toFixed(1) + "px, 0)";

    // The section boundary is a static atmospheric blend, not a moving object.
    el.bank2.style.transform = "translateX(-50%)";
    el.bank3.style.transform = "translateX(-50%)";

    el.sky.style.transform = "translateY(" + (-p * 96).toFixed(2) + "svh)";

    el.content.style.transform = "translateY(" + (-p * 90).toFixed(1) + "px)";
    var contentHidden = p >= 1 / 1.9;
    el.motion.hidden = staticScene || contentHidden;
    if (contentHidden && document.activeElement === el.motion) {
      el.brand.focus({ preventScroll: true });
    }
    el.content.style.opacity = Math.max(0, 1 - p * 1.9).toFixed(3);
    if (contentHidden && el.content.contains(document.activeElement)) {
      el.brand.focus({ preventScroll: true });
    }
    el.content.inert = contentHidden;
    el.content.setAttribute("aria-hidden", String(contentHidden));


  }

  // Only touch the word when its phase changes, not on every cloud frame.
  function renderWord() {
    var word = PHASES[state.phase];
    // Both lines change in the same task while their shared wrapper is hidden.
    el.script.textContent = WORDS[state.wordIndex][0];
    el.ending.textContent = WORDS[state.wordIndex][1];
    el.word.style.transition =
      "opacity " + word.ms + "ms " + word.ease +
      ", transform " + word.ms + "ms " + word.ease +
      ", filter " + word.ms + "ms " + word.ease;
    el.word.style.opacity = word.o;
    el.word.style.filter = "blur(" + word.blur + "px)";
    el.word.style.transform = "translateY(" + word.y + "px) scale(" + word.sc + ")";
  }

  /* ---- lifecycle ------------------------------------------------------- */

  function canAnimate() {
    return !paused && !staticScene && !document.hidden && state.p < 1 / 1.9;
  }

  function stopAnimation() {
    if (animationStopped) return;
    animationStopped = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    if (wordTimer !== null) clearInterval(wordTimer);
    phaseTimers.forEach(clearTimeout);
    frameId = null;
    wordTimer = null;
    phaseTimers = [];
    lastTick = null;
    state.phase = 0;
    renderWord();
    // A pause must also cancel a word transition already in progress.
    el.word.style.transition = "none";
  }

  function loop(now) {
    frameId = null;
    if (!canAnimate()) return;
    if (lastTick !== null) state.t += (now - lastTick) / 1000;
    lastTick = now;
    if (now - lastPaint >= 40) {
      lastPaint = now;
      render();
    }
    frameId = requestAnimationFrame(loop);
  }

  function syncAnimation() {
    if (!canAnimate()) {
      stopAnimation();
      return;
    }
    if (frameId !== null) return;
    animationStopped = false;
    frameId = requestAnimationFrame(loop);
    wordTimer = setInterval(function () {
      state.phase = 1;
      renderWord();
      phaseTimers = [
        setTimeout(function () {
          state.wordIndex = (state.wordIndex + 1) % WORDS.length;
          state.phase = 2;
          renderWord();
        }, OUT),
        setTimeout(function () {
          state.phase = 0;
          renderWord();
        }, OUT + 20)
      ];
    }, CYCLE);
  }

  function onScroll() {
    var vh = el.hero.clientHeight || document.documentElement.clientHeight || 1;
    // Only pause clocks after the whole hero has left the viewport.
    state.p = window.scrollY >= vh ? 1 : 0;
    if (renderedProgress !== state.p || renderedStatic !== staticScene) render();
    syncAnimation();
  }

  function updatePreferences() {
    staticScene = reducedMotion.matches || shortViewport.matches;
    el.hero.classList.toggle("hero--static", staticScene);
    if (staticScene && document.activeElement === el.motion) {
      el.brand.focus({ preventScroll: true });
    }
    el.motion.hidden = staticScene;
    if (staticScene) {
      state.t = 0;
      state.wordIndex = 0;
      renderWord();
    }
    onScroll();
  }

  el.motion.addEventListener("click", function () {
    paused = !paused;
    el.motion.setAttribute("aria-pressed", String(paused));
    el.motion.textContent = paused ? "Продолжить анимацию" : "Остановить анимацию";
    syncAnimation();
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  reducedMotion.addEventListener("change", updatePreferences);
  shortViewport.addEventListener("change", updatePreferences);

  document.addEventListener("visibilitychange", syncAnimation);
  window.addEventListener("pagehide", stopAnimation);
  window.addEventListener("pageshow", onScroll);
  renderWord();
  updatePreferences();
})();
