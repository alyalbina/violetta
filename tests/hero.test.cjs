const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Minimal DOM + controllable clocks: exercise the actual script and its events.
function scene({ reduced = false, short = false } = {}) {
  const frame = new Map(), intervals = new Map(), timeouts = new Map();
  let id = 0;
  function target() {
    const listeners = {};
    return {
      addEventListener(name, callback) { (listeners[name] ??= []).push(callback); },
      emit(name) { for (const callback of listeners[name] ?? []) callback(); }
    };
  }
  const document = Object.assign(target(), { hidden: false, activeElement: null });
  function element() {
    const classes = new Set();
    return Object.assign(target(), {
      style: {}, attributes: {}, children: [], hidden: false, inert: false,
      classList: { add: c => classes.add(c), toggle: (c, enabled) => enabled ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) },
      appendChild(child) { this.children.push(child); },
      setAttribute(k, value) { this.attributes[k] = value; },
      contains(node) { return node === this || this.children.includes(node); },
      focus() { document.activeElement = this; }
    });
  }
  const nodes = Object.fromEntries(['hero', 'hero-motion', 'brand', 'hero-sky', 'hero-stars', 'hero-cloud-a', 'hero-cloud-b', 'hero-cloud-c', 'hero-bank-2', 'hero-bank-3', 'hero-content', 'hero-word', 'hero-script', 'hero-ending'].map(k => [k, element()]));
  const media = {
    '(prefers-reduced-motion: reduce)': Object.assign(target(), { matches: reduced }),
    '(max-height: 650px)': Object.assign(target(), { matches: short })
  };
  const window = Object.assign(target(), { scrollY: 0, matchMedia: q => media[q] });
  Object.assign(document, {
    documentElement: Object.assign(element(), { clientHeight: 900 }),
    getElementById: k => nodes[k],
    querySelector: s => nodes[s === '.hero' ? 'hero' : 'brand'],
    createElement: element,
    createDocumentFragment: element
  });
  const add = map => callback => { map.set(++id, callback); return id; };
  vm.runInNewContext(readFileSync(require.resolve('../assets/js/hero.js'), 'utf8'), {
    window, document,
    requestAnimationFrame: add(frame), cancelAnimationFrame: i => frame.delete(i),
    setInterval: add(intervals), clearInterval: i => intervals.delete(i),
    setTimeout: add(timeouts), clearTimeout: i => timeouts.delete(i)
  });
  return {
    nodes, window, document, media, frame, intervals, timeouts,
    tick(now) { const callbacks = [...frame.values()]; frame.clear(); callbacks.forEach(cb => cb(now)); },
    scroll(y) { window.scrollY = y; window.emit('scroll'); }
  };
}

test('pause during word exit cancels all clocks and restores a readable word', () => {
  const s = scene();
  assert.equal(s.frame.size, 1);
  [...s.intervals.values()][0]();
  assert.equal(s.timeouts.size, 2);
  s.nodes['hero-motion'].emit('click');
  assert.equal(s.frame.size + s.intervals.size + s.timeouts.size, 0);
  assert.equal(s.nodes['hero-word'].style.opacity, 1);
  assert.equal(s.nodes['hero-word'].style.transition, 'none');
  assert.equal(s.nodes['hero-motion'].attributes['aria-pressed'], 'true');
  s.nodes['hero-motion'].emit('click');
  s.window.emit('resize');
  assert.equal(s.frame.size, 1);
  assert.equal(s.intervals.size, 1);
});

test('natural scrolling keeps content visible and pauses only after the viewport', () => {
  const s = scene();
  s.document.activeElement = s.nodes['hero-content'];
  s.scroll(700);
  assert.equal(s.nodes['hero-content'].inert, false);
  assert.equal(s.nodes['hero-content'].style.opacity, '1.000');
  assert.equal(s.document.activeElement, s.nodes['hero-content']);
  assert.equal(s.frame.size, 1);
  s.scroll(1000);
  assert.equal(s.frame.size + s.intervals.size, 0);
  assert.equal(s.nodes['hero-content'].inert, false);
  s.scroll(0);
  assert.equal(s.frame.size, 1);
});
test('background tab suspends clocks; resuming does not jump elapsed animation time', () => {
  const s = scene();
  s.tick(100); s.tick(200);
  const before = s.nodes['hero-cloud-a'].style.transform;
  s.document.hidden = true;
  s.document.emit('visibilitychange');
  assert.equal(s.frame.size + s.intervals.size + s.timeouts.size, 0);
  s.document.hidden = false;
  s.document.emit('visibilitychange');
  s.tick(100000);
  assert.equal(s.nodes['hero-cloud-a'].style.transform, before);
  assert.equal(s.intervals.size, 1);
});

for (const mode of ['reduced', 'short']) {
  test(`${mode} viewport uses static, scrollable content without animation clocks`, () => {
    const s = scene({ [mode]: true });
    assert.equal(s.nodes.hero.classList.contains('hero--static'), true);
    assert.equal(s.nodes['hero-motion'].hidden, true);
    s.scroll(2000);
    assert.equal(s.nodes['hero-content'].style.opacity, '1.000');
    assert.equal(s.nodes['hero-content'].inert, false);
    assert.equal(s.frame.size + s.intervals.size + s.timeouts.size, 0);
  });
}

test('live motion preference changes cancel pending transitions and preserve manual pause', () => {
  const s = scene();
  [...s.intervals.values()][0]();
  const preference = s.media['(prefers-reduced-motion: reduce)'];
  preference.matches = true; preference.emit('change');
  assert.equal(s.timeouts.size + s.frame.size + s.intervals.size, 0);
  assert.equal(s.nodes['hero-script'].textContent, 'расскажет вашу');
  assert.equal(s.nodes['hero-ending'].textContent, 'историю');
  preference.matches = false; preference.emit('change');
  assert.equal(s.frame.size, 1);
  s.nodes['hero-motion'].emit('click');
  preference.matches = true; preference.emit('change');
  preference.matches = false; preference.emit('change');
  assert.equal(s.frame.size + s.intervals.size, 0);
});

test('page cache lifecycle stops and resumes only one set of clocks', () => {
  const s = scene();
  s.window.emit('pagehide');
  assert.equal(s.frame.size + s.intervals.size + s.timeouts.size, 0);
  s.window.emit('pageshow'); s.window.emit('pageshow');
  assert.equal(s.frame.size, 1);
  assert.equal(s.intervals.size, 1);
});

test('scrolling below the scene does no repeated DOM writes and returning resumes it', () => {
  const s = scene();
  s.scroll(50000);
  let writes = 0;
  for (const node of Object.values(s.nodes)) node.style = new Proxy(node.style, { set(target,key,value) { writes++; target[key]=value; return true; } });
  for (let i=0;i<100;i++) s.scroll(50000+i);
  assert.equal(writes, 0);
  assert.equal(s.frame.size+s.intervals.size+s.timeouts.size, 0);
  s.scroll(0);
  assert.ok(writes>0);
  assert.equal(s.frame.size, 1);
});


test('hero semantic pairs cycle atomically in order without rewriting the accessible heading', () => {
  const s=scene();
  const pairs=[['расскажет вашу','историю'],['превратит чувства','в музыку'],['скажет главное','за вас'],['останется с вами','навсегда']];
  for(let i=0;i<8;i++) {
    const pair=pairs[i%4];
    assert.deepEqual([s.nodes['hero-script'].textContent,s.nodes['hero-ending'].textContent],pair);
    [...s.intervals.values()][0]();
    const callbacks=[...s.timeouts.values()];s.timeouts.clear();callbacks.forEach(cb=>cb());
  }
  s.window.emit('pagehide');
  assert.equal(s.frame.size+s.intervals.size+s.timeouts.size,0);
});
test('transition cloud banks remain still while the original side clouds animate', () => {
  const s=scene(); s.tick(100);
  const side=s.nodes['hero-cloud-a'].style.transform;
  for(let second=1;second<=181;second++) {
    s.tick(100+second*1000);
    for(const id of ['hero-bank-2','hero-bank-3']) assert.equal(s.nodes[id].style.transform,'translateX(-50%)');
  }
  assert.notEqual(s.nodes['hero-cloud-a'].style.transform,side);
});