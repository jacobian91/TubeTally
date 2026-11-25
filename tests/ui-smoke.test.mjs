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
  assert.equal(i18n.translate('Show fields from'), 'Mostrar campos de');
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

test('field scopes, row navigation and long press hooks are wired', () => {
  assert.match(html, /id="savedFieldsScopeSelect"/);
  assert.match(html, /tubetally:open-organization-fields/);
  assert.match(html, /fieldViz'\)\.addEventListener\('click'/);
  assert.match(html, /openChangeRowDialog\(n, state\.rows\[n\]\)/);
  assert.match(html, /holdTimer = setTimeout/);
  assert.match(workerSource, /'\.\/i18n\.js'/);
});
