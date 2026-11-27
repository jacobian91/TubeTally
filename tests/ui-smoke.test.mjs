import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const languageSource = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/service-worker.js', import.meta.url), 'utf8');

test('inline application scripts are valid JavaScript', () => {
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes));
  assert.ok(inline.length > 0);
  for (const [, , script] of inline) new Script(script, { filename: 'src/index.html inline script' });
});

test('Spanish localization parses and translates critical controls', () => {
  const context = createContext({
    window: {},
    document: { documentElement: {}, body: null },
    MutationObserver: class { observe() {} },
  });
  new Script(languageSource).runInContext(context);
  const i18n = context.window.tubeTallyI18n;
  assert.equal(i18n.translate('Good'), 'Bien');
  assert.equal(i18n.translate('Slow'), 'Lento');
  assert.equal(i18n.translate('Fast'), 'Rápido');
  assert.equal(i18n.translate('Invite someone to Tube Tally'), 'Invitar a alguien a Tube Tally');
  assert.equal(i18n.translate('Viewing West 40'), 'Viendo West 40');
  i18n.setLanguage('es');
  assert.equal(context.document.documentElement.lang, 'es');
  i18n.setLanguage('en');
  assert.equal(context.document.documentElement.lang, 'en');
});

test('shared links are passed as URLs, and query and legacy fragment links are accepted', () => {
  assert.match(html, /url\.searchParams\.set\('d'/);
  assert.match(html, /navigator\.share\(\{[^}]*url\s*\}/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)\.get\('d'\)/);
  assert.match(html, /fullHash\.substring\(fullHash\.indexOf\('d='\)/);
  assert.match(html, /cbUrl\.searchParams\.set\('cb'/);
});

test('personal fields, independent sharing, responsive header and long-press hooks are wired', () => {
  assert.doesNotMatch(html, /id="savedFieldsScopeSelect"|id="authOrganizations"|id="fieldOrganizationSelect"/);
  assert.match(html, /id="accountInviteForm"/);
  assert.match(html, /class="topbar /);
  assert.match(html, /@media \(max-width: 760px\)/);
  assert.match(html, /Shared links open directly in independent edit mode/);
  assert.match(html, /cleanedUrl\.searchParams\.delete\('d'\)/);
  assert.match(html, /fieldViz'\)\.addEventListener\('click'/);
  assert.match(html, /openChangeRowDialog\(n, state\.rows\[n\]\)/);
  assert.match(html, /holdTimer = setTimeout/);
  assert.match(html, /Hold to edit/);
  assert.match(workerSource, /'\.\/i18n\.js'/);
});

test('history rows open edit with haptic at 500ms, cancel on tap or scroll', () => {
  const start = html.indexOf('        if (!viewMode) {\n          let holdTimer = null;');
  const end = html.indexOf('\n        h.appendChild(d);', start);
  assert.ok(start >= 0 && end > start, 'history interaction handlers exist');
  const listeners = {};
  const timers = new Map();
  let timerId = 0;
  const edits = [];
  const vibrations = [];
  const row = {
    style: {},
    addEventListener(type, callback) { listeners[type] = callback; },
    setAttribute() {},
  };
  const context = createContext({
    d: row, viewMode: false, n: 5, state: { rows: { 5: 'green' } },
    vib(duration) { vibrations.push(duration); },
    openChangeRowDialog(number, status) { edits.push([number, status]); },
    setTimeout(callback, ms) {
      assert.equal(ms, 500);
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  new Script(html.slice(start, end)).runInContext(context);
  const pointer = (x = 10, y = 10) => ({ button: 0, isPrimary: true, clientX: x, clientY: y });
  const fireTimer = () => {
    for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
  };

  assert.equal(listeners.click, undefined, 'short click must not edit');
  listeners.pointerdown(pointer());
  listeners.pointerup(pointer());
  fireTimer();
  assert.equal(edits.length, 0, 'short tap must not edit');
  listeners.pointerdown(pointer());
  listeners.pointermove(pointer(10, 30));
  fireTimer();
  assert.equal(edits.length, 0, 'scrolling must cancel hold');
  listeners.pointerdown(pointer());
  listeners.pointercancel(pointer());
  fireTimer();
  assert.equal(edits.length, 0, 'cancel must stop hold');
  listeners.pointerdown(pointer());
  fireTimer();
  assert.deepEqual(edits, [[5, 'green']], 'long hold opens editor');
  assert.deepEqual(vibrations, [18], 'haptic fires once at the exact same hold threshold as dialog');
});

test('iPhone install area shows Safari Home Screen instructions, not a disabled install button', () => {
  assert.match(html, /id="iosInstallInstructions"/);
  assert.match(html, /Select Add to Home Screen\./);
  assert.match(html, /Turn on Open as Web App/);
  assert.match(html, /isAppleMobile && state !== 'installed'/);
  assert.match(html, /installBtnEl\.classList\.toggle\('hidden', isAppleMobile\)/);
  assert.match(html, /isSafariOnAppleMobile/);
  assert.equal(languageSource.includes('Selecciona Añadir a pantalla de inicio.'), true);
  assert.match(workerSource, /tubetally-runtime-v15/);
});
