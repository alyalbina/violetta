(function () {
  'use strict';
  var data = window.VivobitData;
  var request = window.VivobitRequest;
  if (!data || !request) return;

  /* Header: a disclosure, so normal links and normal Tab navigation apply. */
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  function closeMenu(returnFocus) {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  });
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) closeMenu(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) closeMenu(true);
  });
  document.addEventListener('click', function (event) {
    if (!header.contains(event.target)) closeMenu(false);
  });
  document.addEventListener('focusin', function (event) {
    if (!header.contains(event.target)) closeMenu(false);
  });
  window.matchMedia('(min-width: 860px)').addEventListener('change', function (event) {
    if (event.matches) {
      var inside = menu.contains(document.activeElement) || document.activeElement === toggle;
      closeMenu(false);
      if (inside) document.querySelector('.nav__brand').focus();
    }
  });
  toggle.hidden = false;
  document.documentElement.classList.add('landing-enhanced');

  // Keep keyboard focus with the destination after closing the mobile menu.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function () {
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  /* Examples: real HTMLAudioElement events, with an explicit missing-media state. */
  var audio = document.getElementById('song-audio');
  var play = document.getElementById('song-play');
  var coverPlay = document.getElementById('song-cover-play');
  var seek = document.getElementById('song-seek');
  var status = document.getElementById('song-status');
  var tabs = Array.from(document.querySelectorAll('[data-song]'));
  var activeSong = 0;
  var mediaGeneration = 0;
  var prototypeTimes = data.songs.map(function () { return 0; });
  var visited = data.songs.map(function () { return false; });
  var prototypeTimer = null;
  var prototypePlaying = false;
  var art = document.getElementById('song-art');
  var vinyl = document.getElementById('song-vinyl');
  var vinylTimer = null;
  var vinylReady = true;
  var vinylExtended = false;
  function selectVinyl(song) {
    clearTimeout(vinylTimer);
    var wasExtended = art.dataset.vinyl === 'extended';
    vinylExtended = false;
    vinylReady = false;
    art.dataset.vinyl = 'idle';
    function reveal() {
      var generation = mediaGeneration;
      function ready() {
        if (generation !== mediaGeneration) return;
        vinylReady = true;
        art.dataset.vinyl = vinylExtended ? 'extended' : 'idle';
      }
      vinyl.onload = ready;
      vinyl.src = song.vinyl;
      if (vinyl.complete && vinyl.naturalWidth > 0) ready();
    }
    // Retract the old record before revealing the next one. One layer, one timer.
    if (wasExtended && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) vinylTimer = setTimeout(reveal, 300);
    else reveal();
  }
  function pausePrototype() {
    clearInterval(prototypeTimer); prototypeTimer = null; prototypePlaying = false;
  }
  function time(value) {
    if (!Number.isFinite(value)) return '0:00';
    return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
  }
  function setPlaying(playing) {
    art.dataset.playing = String(playing);
    if (playing) vinylExtended = true;
    if (vinylReady) art.dataset.vinyl = vinylExtended ? 'extended' : 'idle';
    play.dataset.playing = String(playing);
    play.setAttribute('aria-label', playing ? 'Пауза' : 'Слушать');
    var song = data.songs[activeSong];
    coverPlay.dataset.playing = String(playing);
    coverPlay.setAttribute('aria-pressed', String(playing));
    coverPlay.setAttribute('aria-label', (playing ? 'Пауза: ' : 'Слушать: ') + song.title);
    tabs.forEach(function (tab, index) {
      tab.dataset.playback = index === activeSong && playing ? 'playing' : (visited[index] ? 'paused' : 'idle');
    });
  }
  function updateTime() {
    var song = data.songs[activeSong];
    var duration = song.audioSrc ? audio.duration : song.prototypeDuration;
    var current = song.audioSrc ? audio.currentTime : prototypeTimes[activeSong];
    var progress = Number.isFinite(duration) && duration > 0 ? current / duration : 0;
    document.getElementById('song-current').textContent = time(current || 0);
    document.getElementById('song-duration').textContent = time(duration);
    seek.disabled = !Number.isFinite(duration) || duration <= 0;
    seek.value = progress * 100;
    document.querySelectorAll('.wave-bar').forEach(function (bar, i) {
      bar.classList.toggle('is-played', i / 48 < progress);
    });
  }
  function selectSong(index, focus) {
    pausePrototype();
    activeSong = index;
    visited[index] = true;
    mediaGeneration++;
    audio.pause();
    audio.removeAttribute('src');
    var song = data.songs[index];
    selectVinyl(song);
    var cover = document.getElementById('song-cover');
    cover.src = song.cover;
    cover.alt = 'Обложка песни «' + song.title + '»';
    document.getElementById('examples').style.background = song.tint;
    ['title', 'occasion', 'context', 'genre'].forEach(function (field) {
      document.getElementById('song-' + field).textContent = song[field];
    });
    var detail = document.getElementById('song-detail');
    while (detail.childNodes.length > 1) detail.removeChild(detail.lastChild);
    detail.appendChild(document.createTextNode(song.detail));
    tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    document.getElementById('song-panel').setAttribute('aria-labelledby', tabs[index].id);
    setPlaying(false);
    play.disabled = false;
    coverPlay.disabled = false;
    document.getElementById('song-media').hidden = false;
    status.textContent = '';
    if (song.audioSrc) { audio.src = song.audioSrc; audio.load(); }
    updateTime();
    if (focus) tabs[index].focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      if (index !== activeSong) selectSong(index, false);
      togglePlayback();
    });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectSong(next, true); }
    });
  });
  async function togglePlayback() {
    if (!data.songs[activeSong].audioSrc) {
      if (prototypePlaying) { pausePrototype(); setPlaying(false); return; }
      if (prototypeTimes[activeSong] >= data.songs[activeSong].prototypeDuration) prototypeTimes[activeSong] = 0;
      prototypePlaying = true; setPlaying(true);
      var lastTick = Date.now();
      prototypeTimer = setInterval(function () {
        var now = Date.now();
        prototypeTimes[activeSong] = Math.min(data.songs[activeSong].prototypeDuration, prototypeTimes[activeSong] + (now - lastTick) / 1000);
        lastTick = now; updateTime();
        if (prototypeTimes[activeSong] >= data.songs[activeSong].prototypeDuration) { pausePrototype(); setPlaying(false); }
      }, 250);
      return;
    }
    if (!audio.paused) { audio.pause(); return; }
    var generation = mediaGeneration;
    status.textContent = 'Загружаем песню…';
    try { await audio.play(); }
    catch (error) {
      if (generation !== mediaGeneration) return;
      setPlaying(false);
      status.textContent = 'Не удалось включить песню. Попробуйте ещё раз.';
    }
  }
  play.addEventListener('click', togglePlayback);
  coverPlay.addEventListener('click', togglePlayback);
  window.addEventListener('pagehide', function () { clearTimeout(vinylTimer); vinyl.src = data.songs[activeSong].vinyl; vinylReady = true; pausePrototype(); audio.pause(); setPlaying(false); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && prototypePlaying) { pausePrototype(); setPlaying(false); } });
  audio.addEventListener('playing', function () { if (data.songs[activeSong].audioSrc) { setPlaying(true); status.textContent = 'Воспроизводится'; } });
  audio.addEventListener('pause', function () {
    if (!data.songs[activeSong].audioSrc) return;
    setPlaying(false);
    if (data.songs[activeSong].audioSrc && !audio.ended) status.textContent = 'На паузе';
  });
  audio.addEventListener('ended', function () { setPlaying(false); status.textContent = 'Песня закончилась'; });
  audio.addEventListener('waiting', function () { status.textContent = 'Загружаем песню…'; });
  audio.addEventListener('error', function () {
    if (data.songs[activeSong].audioSrc) { setPlaying(false); status.textContent = 'Песня сейчас недоступна. Попробуйте ещё раз.'; }
  });
  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('timeupdate', updateTime);
  seek.addEventListener('input', function () {
    if (!data.songs[activeSong].audioSrc) { prototypeTimes[activeSong] = Number(seek.value) / 100 * data.songs[activeSong].prototypeDuration; updateTime(); }
    else if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 100 * audio.duration;
  });
  selectSong(0, false);

  /* Request: native radio groups; prepare a message for the supplied contact. */
  var form = document.getElementById('request-form');
  var submit = document.getElementById('request-submit');
  var contact = document.getElementById('contact');
  var contactHelp = document.getElementById('contact-help');
  var formStatus = document.getElementById('request-status');
  var handoff = document.getElementById('request-handoff');
  var message = document.getElementById('request-message');
  var channels = {
    telegram: ['Ваш Telegram', '@nickname', 'Укажите ваш @username'],
    vk: ['Ссылка на вашу страницу ВКонтакте', 'https://vk.com/username', 'Оставьте ссылку на страницу, чтобы менеджер мог вам написать.']
  };
  var avitoUrl = data.avitoUrl || '';
  var avitoContact = document.getElementById('avito-contact');
  var handoffChannel = 'telegram';
  function setDestination(link, url) {
    if (url) { link.href = url; link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex'); }
    else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.setAttribute('tabindex', '-1'); }
  }
  setDestination(document.getElementById('avito-link'), avitoUrl);
  document.getElementById('avito-unavailable').hidden = !!avitoUrl;
  var contactDrafts = {};
  var previousChannel = form.elements.channel.value;
  var errorNodes = {};
  ['recipient', 'occasion', 'product', 'channel', 'contact'].forEach(function (name) {
    var controls = Array.from(form.querySelectorAll('[name="' + name + '"]'));
    var host = controls[0].closest('fieldset') || controls[0].parentElement;
    var hint = document.createElement('p');
    hint.id = name + '-error'; hint.className = 'field-error'; hint.hidden = true;
    host.appendChild(hint); errorNodes[name] = hint;
    controls.forEach(function (control) {
      control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
    });
  });
  function clearError(name) {
    if (!errorNodes[name]) return;
    errorNodes[name].hidden = true;
    errorNodes[name].textContent = '';
    form.querySelectorAll('[name="' + name + '"]').forEach(function (control) {
      control.removeAttribute('aria-invalid');
    });
  }
  function updateContact() {
    var channel = form.elements.channel.value;
    var copy = channels[channel];
    var isAvito = channel === 'avito';
    contact.parentElement.hidden = isAvito;
    contact.disabled = isAvito;
    contact.required = !isAvito;
    avitoContact.hidden = !isAvito;
    if (copy) {
      document.querySelector('label[for="contact"]').textContent = copy[0];
      contact.placeholder = copy[1];
      contactHelp.textContent = copy[2];
    }
    contact.setCustomValidity('');
    clearError('contact');
    formStatus.textContent = '';
  }
  form.addEventListener('change', function (event) {
    clearError(event.target.name);
    if (event.target.name === 'channel') {
      contactDrafts[previousChannel] = contact.value;
      previousChannel = form.elements.channel.value;
      contact.value = contactDrafts[previousChannel] || '';
      updateContact();
    }
    formStatus.textContent = '';
  });
  contact.addEventListener('input', function () { contact.setCustomValidity(''); clearError('contact'); formStatus.textContent = ''; });
  document.querySelectorAll('[data-product]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      form.hidden = false; handoff.hidden = true;
      form.elements.product.value = link.dataset.product;
      clearError('product');
      var selected = form.querySelector('[name="product"]:checked');
      selected.focus({ preventScroll: true });
      selected.closest('fieldset').scrollIntoView({ block: 'center' });
      formStatus.textContent = '';
    });
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var values = request.normalize(Object.fromEntries(new FormData(form)));
    var error = request.validate(values);
    if (error) {
      formStatus.textContent = error.message;
      var hint = errorNodes[error.field];
      hint.textContent = error.message; hint.hidden = false;
      var controls = form.querySelectorAll('[name="' + error.field + '"]');
      controls.forEach(function (control) { control.setAttribute('aria-invalid', 'true'); });
      var target = controls[0];
      target.focus({ preventScroll: true });
      (target.closest('fieldset') || target.parentElement).scrollIntoView({ block: 'center' });
      return;
    }
    message.value = request.format(values, data.form);
    handoffChannel = values.channel;
    var isAvito = handoffChannel === 'avito';
    document.getElementById('handoff-help').textContent = isAvito
      ? 'Скопируйте заявку и отправьте её нам на Авито.' + (avitoUrl ? '' : ' Ссылка на Авито пока недоступна.')
      : 'Скопируйте текст и отправьте менеджеру в Telegram. В заявке указан выбранный вами способ связи.';
    var handoffLink = document.getElementById('handoff-link');
    handoffLink.textContent = isAvito ? 'Перейти в Авито ↗' : 'Открыть Telegram ↗';
    setDestination(handoffLink, isAvito ? avitoUrl : 'https://t.me/vivo_support');
    form.hidden = true;
    handoff.hidden = false;
    document.getElementById('copy-status').textContent = '';
    handoff.focus({ preventScroll: true });
    handoff.scrollIntoView({ block: 'start' });
  });
  document.getElementById('copy-request').addEventListener('click', async function () {
    var copyStatus = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(message.value);
      copyStatus.textContent = handoffChannel === 'avito' ? 'Заявка скопирована. Отправьте её нам в чате Авито.' : 'Скопировано. Откройте Telegram и отправьте текст менеджеру.';
    } catch (error) {
      message.focus(); message.select();
      copyStatus.textContent = 'Выделили текст заявки. Скопируйте его вручную.';
    }
  });
  document.getElementById('edit-request').addEventListener('click', function () {
    handoff.hidden = true; form.hidden = false; submit.focus();
  });
  // All controls are wired before enabling submit; no GET fallback leaks form data.
  updateContact();
  form.noValidate = true;
  submit.disabled = false;
})();
