import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.TUBETALLY_E2E_URL;
const email = process.env.TUBETALLY_E2E_ADMIN_EMAIL;
const password = process.env.TUBETALLY_E2E_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) throw new Error('Missing browser test credentials.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let createdRunId = null;

async function primeVersion(ctx) {
  const response = await ctx.request.get(new URL('/version.json', baseUrl).href);
  if (!response.ok()) throw new Error('Preview version endpoint unavailable');
  const { version } = await response.json();
  await ctx.addInitScript(currentVersion => {
    localStorage.setItem('tubetally.cachedVersion', currentVersion);
    sessionStorage.setItem('tubetally.reloadedFor', currentVersion);
  }, version);
}

try {
  await primeVersion(context);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Object.hasOwn(window, 'tubeTallyUser'));

  // Check visible toolbar buttons on the smallest supported phone sizes.
  for (const width of [320, 360, 390, 720, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const ids = ['savedFieldsBtn', 'resetBtn', 'settingsBtn', 'accountBtn'];
      const rects = ids.map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const brand = document.querySelector('.topbar-brand').getBoundingClientRect();
      return { width: window.innerWidth, headerBottom: header.bottom, brand: { left: brand.left, right: brand.right, top: brand.top, bottom: brand.bottom }, rects };
    });
    for (const rect of layout.rects) {
      assert(rect.left >= 0 && rect.right <= layout.width + 1, `${rect.id} must stay on-screen at ${width}px`);
      assert(rect.bottom <= layout.headerBottom + 1, `${rect.id} must be contained in header at ${width}px`);
      assert(rect.right - rect.left > 24, `${rect.id} must have a usable hit target`);
      const overlap = Math.min(rect.right, layout.brand.right) - Math.max(rect.left, layout.brand.left);
      const vertical = Math.min(rect.bottom, layout.brand.bottom) - Math.max(rect.top, layout.brand.top);
      assert(overlap <= 0 || vertical <= 0, `${rect.id} must not overlap brand at ${width}px`);
    }
    for (let i = 0; i < layout.rects.length; i++) {
      for (let j = i + 1; j < layout.rects.length; j++) {
        const a = layout.rects[i], b = layout.rects[j];
        assert(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 0
          || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 0,
          `${a.id} and ${b.id} must not overlap at ${width}px`);
      }
    }
  }
  console.log('PASS: toolbar is usable without overlap at 320, 360, 390, 720, and 1024px');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#accountBtn').click();
  await page.locator('#authDialog[open]').waitFor();
  await page.locator('#authEmail').fill(email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authSubmit').click();
  await page.waitForFunction(() => !!window.tubeTallyUser?.id);
  await page.locator('#accountBtn').click();
  await page.locator('#accountInviteForm').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#authOrganizations').count(), 0);
  const invalidInvite = await page.evaluate(() => fetch('/api/account-invitations', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'not-an-address' })
  }).then(r => r.status));
  assert.equal(invalidInvite, 400, 'Signup invitation endpoint validates email');
  await page.locator('#authClose').click();
  console.log('PASS: account shows signup-only invitations and no organizations');

  const fieldName = `Personal UI test ${Date.now()}`;
  await page.locator('#fieldNameLabel').click();
  await page.locator('#fieldNameDialogInput').fill(fieldName);
  await page.locator('#fieldNameForm button').last().click();
  await page.locator('#btnGood').click();
  createdRunId = await page.evaluate(() => JSON.parse(localStorage.getItem('tubetally.v1'))?.runId);
  await page.locator('#savedFieldsBtn').click();
  await page.locator('#saveFieldBtn').click();
  await page.waitForFunction(name =>
    document.querySelector('#savedFieldsList')?.textContent?.includes(name), fieldName);
  console.log('PASS: personal field appears in saved fields');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.tubeTallyUser?.id, { timeout: 20000 });
  await page.locator('#savedFieldsBtn').click();
  await page.waitForFunction(name =>
    document.querySelector('#savedFieldsList')?.textContent?.includes(name), fieldName);
  await page.waitForFunction(async name => {
    const res = await fetch('/api/fields', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return false;
    const body = await res.json();
    return body.fields?.some(field => field.fieldName === name);
  }, fieldName, { timeout: 15000 });
  console.log('PASS: personal cloud field survives page reload');

  const shareUrl = await page.evaluate(() => buildShareUrl({
    fieldName: 'Shared independent sample', startedAt: '2026-11-26 10:00',
    rows: { 1: 'green' }, currentRow: 2,
  }));
  const receivedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await primeVersion(receivedContext);
    const receiver = await receivedContext.newPage();
    await receiver.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await receiver.waitForFunction(() => document.querySelector('#fieldNameLabel')?.textContent?.includes('Shared independent sample'));
    assert(!receiver.url().includes('d='), 'Share payload must be removed from URL after import');
    await receiver.locator('#btnSlow').click();
    assert.equal(await receiver.locator('#currentRow').textContent(), '3');
    await receiver.reload({ waitUntil: 'domcontentloaded' });
    await receiver.waitForFunction(() => document.querySelector('#currentRow')?.textContent === '3');
    assert.equal(await receiver.locator('#fieldNameLabel').textContent(), 'Shared independent sample');
    console.log('PASS: shared link opens directly for independent editing and survives reload');
  } finally {
    await receivedContext.close();
  }
  assert.deepEqual(errors, [], 'Browser must not throw uncaught JavaScript errors');
} catch (error) {
  console.error('Browser integration failed:', error.message);
  console.error('Browser JavaScript errors:', errors.join(' | '));
  await page.screenshot({ path: '/tmp/personal-ui-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (createdRunId) {
    await page.evaluate(runId => fetch(`/api/fields/${runId}`, { method: 'DELETE', credentials: 'same-origin' }), createdRunId).catch(() => {});
  }
  await context.close();
  await browser.close();
}
