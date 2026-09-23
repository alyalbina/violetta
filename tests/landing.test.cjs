const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const request = require('../assets/js/request-core.js');
const root = path.resolve(__dirname, '..');

function setup(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = query => ({ matches: query.includes('reduced-motion'), addEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = async function () { this.dispatchEvent(new w.Event('playing')); };
  const errors = [];
  w.addEventListener('error', e => errors.push(e.error));
  for (const script of w.document.querySelectorAll('script[src]')) {
    w.eval(fs.readFileSync(path.join(root, script.getAttribute('src').split('?')[0]), 'utf8'));
  }
  assert.deepEqual(errors, []);
  return { w, d: w.document, errors };
}
function fillRequest(w, d) {
  const form = d.getElementById('request-form');
  form.elements.recipient.value = '1';
  form.elements.occasion.value = '1';
  form.elements.product.value = 'clip';
  form.elements.name.value = 'Альбина';
  form.elements.contact.value = '@example_user';
  return form;
}

test('exported pages have unique IDs, resolvable local links and no design runtime', () => {
  for (const name of ['index.html', 'privacy.html', 'offer.html']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    const d = new JSDOM(text).window.document;
    assert.doesNotMatch(text, /{{|<sc-for|<sc-if|<dc-import|support\.js|data-design-action/);
    const ids = [...d.querySelectorAll('[id]')].map(n => n.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const el of d.querySelectorAll('[href], [src]')) {
      const value = el.getAttribute('href') || el.getAttribute('src');
      if (/^[a-z]+:/i.test(value)) continue;
      const [file, hash] = value.split('#');
      if (file) assert.ok(fs.existsSync(path.join(root, decodeURIComponent(file.split('?')[0]))), `${name}: ${value}`);
      else if (hash) assert.ok(d.getElementById(hash), `${name}: ${value}`);
      else assert.fail(`Placeholder URL in ${name}`);
    }
    d.defaultView.close();
  }
});

test('all authored sections and all FAQ answers exist without JavaScript', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  const d = dom.window.document;
  assert.deepEqual([...d.querySelectorAll('main > section')].map(n => n.id), ['how','examples','pricing','request','faq']);
  assert.equal(d.querySelectorAll('.faq-item').length, 6);
  for (const answer of d.querySelectorAll('.faq-answer')) assert.ok(answer.textContent.trim().length > 0);
  assert.equal(d.getElementById('request-submit').disabled, true);
  assert.equal(d.getElementById('request-form').method, 'post');
  dom.window.close();
});

test('mobile disclosure closes on Escape and restores trigger focus', t => {
  const { w, d } = setup(t);
  const toggle = d.querySelector('.menu-toggle');
  toggle.click();
  assert.equal(d.getElementById('mobile-menu').hidden, false);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(d.getElementById('mobile-menu').hidden, true);
  assert.equal(d.activeElement, toggle);
  toggle.click();
  d.querySelector('#mobile-menu a[href="#how"]').click();
  assert.equal(d.getElementById('mobile-menu').hidden, true);
  assert.equal(d.activeElement.id, 'how');
});

test('tariff CTA selects the corresponding package without discarding the form', t => {
  const { w, d } = setup(t);
  const form = fillRequest(w, d);
  for (const product of ['song','clip','time']) {
    d.querySelector(`[data-product="${product}"]`).click();
    assert.equal(form.elements.product.value, product);
    assert.equal(form.elements.name.value, 'Альбина');
  }
});

test('song tabs support arrow keys and prototype playback never loads missing audio', t => {
  const { w, d } = setup(t);
  d.getElementById('song-tab-0').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(d.activeElement.id, 'song-tab-4');
  assert.equal(d.getElementById('song-title').textContent, 'Папина пластинка');
  assert.equal(d.querySelectorAll('[role="tab"][tabindex="0"]').length, 1);
  assert.equal(d.getElementById('song-play').disabled, false);
  assert.equal(d.getElementById('song-current').textContent, '0:00');
  assert.equal(d.getElementById('song-audio').hasAttribute('src'), false);
  assert.equal(d.getElementById('song-media').hidden, false);
  const audio = d.getElementById('song-audio');
  audio.load = audio.play = () => { throw new Error('Prototype must not load media'); };
  const cover = d.getElementById('song-cover-play');
  cover.click();
  assert.equal(cover.getAttribute('aria-pressed'), 'true');
  cover.click();
  assert.equal(cover.getAttribute('aria-pressed'), 'false');
  const seek = d.getElementById('song-seek');
  seek.value = 50; seek.dispatchEvent(new w.Event('input'));
  assert.equal(d.getElementById('song-current').textContent, '1:35');
  assert.equal(audio.hasAttribute('src'), false);
});

test('media progress and play state come from audio events when a source is configured', async t => {
  const { w, d } = setup(t);
  w.VivobitData.songs[1].audioSrc = 'assets/audio/example.mp3';
  d.getElementById('song-tab-1').click();
  assert.equal(d.getElementById('song-media').hidden, false);
  const audio = d.getElementById('song-audio');
  Object.defineProperty(audio, 'duration', { value: 200 });
  audio.currentTime = 50;
  audio.dispatchEvent(new w.Event('loadedmetadata'));
  audio.dispatchEvent(new w.Event('timeupdate'));
  assert.equal(d.getElementById('song-seek').value, '25');
  assert.equal(d.getElementById('song-current').textContent, '0:50');
  assert.equal(d.getElementById('song-duration').textContent, '3:20');
  d.getElementById('song-play').click();
  await Promise.resolve();
  assert.equal(d.getElementById('song-play').dataset.playing, 'true');
  audio.dispatchEvent(new w.Event('error'));
  assert.match(d.getElementById('song-status').textContent, /недоступна/);
  d.getElementById('song-tab-0').click();
  assert.equal(d.getElementById('song-media').hidden, false);
  assert.equal(d.getElementById('song-audio').hasAttribute('src'), false);
});

test('cover toggles playback and switching tracks keeps one synchronized player', async t => {
  const { w, d } = setup(t);
  const audio = d.getElementById('song-audio'), cover = d.getElementById('song-cover-play');
  Object.defineProperty(audio, 'paused', { value: true, writable: true });
  audio.pause = function () { this.paused = true; this.dispatchEvent(new w.Event('pause')); };
  audio.play = async function () { this.paused = false; this.dispatchEvent(new w.Event('playing')); };
  w.VivobitData.songs[0].audioSrc = 'one.mp3';
  w.VivobitData.songs[1].audioSrc = 'two.mp3';
  // Keyboard selection configures the first track without autoplay.
  d.getElementById('song-tab-1').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Home' }));
  assert.equal(audio.paused, true);
  cover.click(); await Promise.resolve();
  assert.equal(audio.paused, false);
  assert.equal(cover.getAttribute('aria-pressed'), 'true');
  cover.click(); assert.equal(audio.paused, true);
  cover.click(); await Promise.resolve();
  d.getElementById('song-tab-1').click(); await Promise.resolve();
  assert.equal(audio.getAttribute('src'), 'two.mp3');
  assert.equal(audio.paused, false);
  assert.equal(d.querySelectorAll('audio').length, 1);
  assert.equal(d.querySelectorAll('[data-playback="playing"]').length, 1);
  assert.equal(d.getElementById('song-tab-0').dataset.playback, 'paused');
  w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(audio.paused, true);
});

test('vinyl assets match songs and extension follows the active cover', t => {
  const { w,d } = setup(t);
  const art=d.getElementById('song-art'), vinyl=d.getElementById('song-vinyl'), cover=d.getElementById('song-cover-play');
  for(const song of w.VivobitData.songs) assert.ok(fs.existsSync(path.join(root,song.vinyl)));
  vinyl.dispatchEvent(new w.Event('load'));
  assert.equal(art.dataset.vinyl,'idle');
  cover.click(); assert.equal(art.dataset.vinyl,'extended');
  cover.click(); assert.equal(art.dataset.playing,'false');
  assert.equal(art.dataset.vinyl,'extended');
  d.getElementById('song-tab-4').click();
  assert.equal(vinyl.getAttribute('src'),w.VivobitData.songs[4].vinyl);
  assert.equal(art.dataset.vinyl,'idle');
  vinyl.dispatchEvent(new w.Event('load'));
  assert.equal(art.dataset.vinyl,'extended');
  assert.equal(d.querySelectorAll('.vinyl-sleeve').length,1);
});

test('valid request becomes an editable message, with no false delivery confirmation', async t => {
  const { w, d } = setup(t);
  const form = fillRequest(w, d);
  assert.equal(form.checkValidity(), true);
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(form.hidden, true);
  assert.equal(d.getElementById('request-handoff').hidden, false);
  const message = d.getElementById('request-message').value;
  assert.match(message, /Для кого: Маме/);
  assert.match(message, /Подарок: Песня \+ видеоклип/);
  assert.match(message, /@example_user/);
  assert.doesNotMatch(d.getElementById('request-handoff').textContent, /Заявка уже у нас|успешно отправлена/);
  let copied;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  d.getElementById('copy-request').click();
  await Promise.resolve();
  assert.equal(copied, message);
  d.getElementById('edit-request').click();
  assert.equal(form.hidden, false);
  assert.equal(form.elements.name.value, 'Альбина');
});

test('invalid contact prevents the handoff; channel change updates visible guidance', t => {
  const { w, d } = setup(t);
  const form = fillRequest(w, d);
  form.elements.contact.value = 'x';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(d.getElementById('request-handoff').hidden, true);
  assert.match(d.getElementById('request-status').textContent, /Telegram/);
  const vk = d.querySelector('input[name="channel"][value="vk"]');
  vk.checked = true; vk.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(form.elements.contact.validity.customError, false);
  assert.equal(form.elements.contact.hasAttribute('aria-invalid'), false);
  assert.equal(form.elements.contact.placeholder, 'https://vk.com/username');
});

test('request rules reject unknown choices and preserve literal user text safely', () => {
  const good = request.normalize({ recipient:'1', occasion:'10', product:'song', channel:'vk', contact:' https://vk.com/example_user ', name:' <b>Вера</b> ' });
  assert.equal(request.validate(good), null);
  assert.equal(good.name, '<b>Вера</b>');
  assert.equal(request.validate({...good, recipient:'99'}).field, 'recipient');
  assert.equal(request.validate({...good, product:'free'}).field, 'product');
  assert.equal(request.validate({...good, contact:'javascript:alert(1)'}).field, 'contact');
});

// Legal routes stay relative so the site keeps working under a deployment base
// path. Whether they open in a new tab is a separate question, and it depends on
// the page: index.html carries the request draft, the document pages do not.
test('legal links resolve relative to a deployment base path', () => {
  for (const file of ['index.html','privacy.html','offer.html']) {
    const dom = new JSDOM(fs.readFileSync(path.join(root,file),'utf8'), {url:'https://example.test/vivobit/'+file});
    const d = dom.window.document;
    assert.equal(d.querySelector('script[src*="legal-dialog"]'),null);
    const expectNewTab = file === 'index.html' ? '_blank' : '';
    for (const route of ['privacy.html','offer.html']) {
      const links=d.querySelectorAll('a[href="'+route+'"]');
      assert.ok(links.length);
      for(const link of links) {
        assert.equal(link.href,'https://example.test/vivobit/'+route);
        assert.equal(link.target, expectNewTab,
          `${file} → ${route}: only the page holding a draft opens documents in a new tab`);
      }
    }
    dom.window.close();
  }
});

test('song panel follows its tabs and consultation links bypass order requirements', t => {
  const { d } = setup(t);
  const tabs = d.querySelector('[role="tablist"]'), panel = d.getElementById('song-panel');
  assert.ok(tabs.compareDocumentPosition(panel) & 4);
  assert.ok(tabs.nextElementSibling.contains(panel));
  for (const link of d.querySelectorAll('#faq a, .pricing-note a')) {
    assert.equal(link.getAttribute('href'), 'https://t.me/vivo_support');
    assert.equal(link.hasAttribute('data-product'), false);
  }
});

test('clip card and form agree on the package and its pricing statement', t => {
  const { w,d } = setup(t);
  const product = w.VivobitData.form.products[1];
  const card = d.querySelector('#pricing [data-product="clip"]').textContent;
  const choice = d.querySelector('[name="product"][value="clip"]').parentElement.textContent;
  for (const text of [card,choice]) {
    assert.ok(text.includes(product[1]));
    assert.ok(text.includes(product[2]));
  }
});

test('Avito does not require contact and handoff intent matches every product', t => {
  const { w } = setup(t);
  const good = request.normalize({recipient:'1',occasion:'1',product:'time',channel:'avito',contact:'https://www.avito.ru/user/abc123/profile'});
  assert.equal(request.validate({...good, contact:''}), null);
  assert.equal(request.normalize({...good,contact:'@old_username'}).contact, '');
  for (const product of ['song','clip','time','undecided']) {
    const message=request.format({...good,product},w.VivobitData.form);
    assert.doesNotMatch(message,/Хочу заказать персональную песню/);
    assert.match(message,product==='undecided'?/Хочу обсудить подарок/:/Хочу оформить заказ/);
  }
});

test('missing choice has a visible associated error and keeps previously entered text', t => {
  const { w, d } = setup(t);
  const form = d.getElementById('request-form');
  form.elements.name.value = 'Анна-Мария';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const first = form.querySelector('[name="recipient"]');
  assert.equal(d.activeElement, first);
  assert.equal(first.getAttribute('aria-invalid'), 'true');
  assert.match(first.getAttribute('aria-describedby'), /recipient-error/);
  assert.equal(d.getElementById('recipient-error').hidden, false);
  assert.equal(form.elements.name.value, 'Анна-Мария');
  first.value = '1';
  first.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(first.hasAttribute('aria-invalid'), false);
  assert.equal(d.getElementById('recipient-error').hidden, true);
});

test('changing contact channel restores each draft without leaking it into a different channel', t => {
  const { w, d } = setup(t);
  const form = fillRequest(w, d);
  function choose(value) {
    const input = form.querySelector(`[name="channel"][value="${value}"]`);
    input.checked = true;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  choose('vk');
  assert.equal(form.elements.contact.value, '');
  form.elements.contact.value = 'vk.com/example_user';
  choose('telegram');
  assert.equal(form.elements.contact.value, '@example_user');
  choose('vk');
  assert.equal(form.elements.contact.value, 'vk.com/example_user');
});

test('clipboard rejection leaves the whole message selected for manual copying', async t => {
  const { w, d } = setup(t);
  fillRequest(w, d).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
  d.getElementById('copy-request').click();
  await new Promise(setImmediate);
  const message = d.getElementById('request-message');
  assert.equal(d.activeElement, message);
  assert.equal(message.selectionStart, 0);
  assert.equal(message.selectionEnd, message.value.length);
  assert.match(d.getElementById('copy-status').textContent, /вручную/);
});

test('Avito hides and disables contact, prepares and copies without leaking previous contact', async t => {
  const {w,d}=setup(t); const form=fillRequest(w,d);
  const choose=value=>{const radio=form.querySelector(`[name="channel"][value="${value}"]`);radio.checked=true;radio.dispatchEvent(new w.Event('change',{bubbles:true}));};
  choose('avito');
  assert.equal(form.elements.contact.disabled,true);
  assert.equal(form.elements.contact.required,false);
  assert.equal(form.elements.contact.parentElement.hidden,true);
  assert.equal(d.getElementById('avito-contact').hidden,false);
  assert.equal(d.getElementById('avito-link').href,w.VivobitData.avitoUrl);
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(d.getElementById('request-handoff').hidden,false);
  const text=d.getElementById('request-message').value;
  assert.match(text,/Способ связи: Авито/); assert.doesNotMatch(text,/@example_user|Контакт:|Страница:/);
  assert.equal(d.getElementById('handoff-link').href,w.VivobitData.avitoUrl);
  assert.equal(d.getElementById('handoff-link').target,'_blank');
  let copied; Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  d.getElementById('copy-request').click(); await new Promise(setImmediate);
  assert.equal(copied,text); assert.match(d.getElementById('copy-status').textContent,/Авито/);
  d.getElementById('edit-request').click(); choose('vk');
  assert.equal(form.elements.contact.disabled,false); assert.equal(form.elements.contact.required,true);
  assert.equal(form.elements.contact.parentElement.hidden,false); assert.equal(d.getElementById('avito-contact').hidden,true);
  form.elements.contact.value='https://vk.com/example_user';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.match(d.getElementById('request-message').value,/Страница: https:\/\/vk.com\/example_user/);
});
// Regression guard for D01: reading a legal document must never unload the page
// holding a filled-in request. The earlier dialog-based fix was removed without
// any test noticing, and the draft is intentionally kept out of any storage —
// so the only thing preserving it is that these links open in a new tab.
test('legal links never unload a filled request draft', t => {
  const {d}=setup(t);
  const links=[...d.querySelectorAll('a[href$="privacy.html"], a[href$="offer.html"]')];
  assert.ok(links.length>=4, `expected the legal links to be present, found ${links.length}`);
  for (const link of links) {
    assert.equal(link.target,'_blank', `${link.getAttribute('href')} must open in a new tab`);
    assert.match(link.rel,/noopener/, `${link.getAttribute('href')} must set rel=noopener`);
    assert.match(link.textContent,/новой вкладке/, `${link.getAttribute('href')} must announce the new tab`);
  }
});

test('request draft survives reading a legal document', t => {
  const {w,d}=setup(t); const form=fillRequest(w,d);
  form.elements.contact.value='@vera'; form.elements.name.value='Вера';
  d.querySelector('.form-policy a[href$="privacy.html"]').click();
  // A target=_blank link leaves this document untouched, so the draft is still here.
  assert.equal(form.elements.contact.value,'@vera');
  assert.equal(form.elements.name.value,'Вера');
  assert.equal(d.getElementById('request').isConnected,true);
});
