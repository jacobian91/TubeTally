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
  for (const width of [320, 360, 390, 414, 600, 720, 760, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const ids = ['savedFieldsBtn', 'resetBtn', 'settingsBtn', 'accountBtn'];
      const rects = ids.map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const display = getComputedStyle(document.querySelector('.topbar')).display;
      const brand = document.querySelector('.topbar-brand').getBoundingClientRect();
      return { width: window.innerWidth, headerBottom: header.bottom, display,
        brand: { left: brand.left, right: brand.right, top: brand.top, bottom: brand.bottom }, rects };
    });
    assert.equal(layout.display, 'grid', `Toolbar must use grid, not squashed flexbox at ${width}px`);
    if (width <= 760) {
      const actions = layout.rects.slice(0, 3);
      for (const button of actions) {
        assert(Math.abs(button.top - actions[0].top) <= 2,
          `Fields, New and Settings must be on the same row at ${width}px`);
        assert(Math.abs((button.right - button.left) - (actions[0].right - actions[0].left)) <= 2,
          `Toolbar action buttons must be equally sized at ${width}px`);
        assert(button.top >= layout.brand.bottom - 1,
          `Action buttons must be below the brand, not squeezed between brand and account at ${width}px`);
      }
      const account = layout.rects[3];
      const accountCenterY = (account.top + account.bottom) / 2;
      const brandCenterY = (layout.brand.top + layout.brand.bottom) / 2;
      assert(Math.abs(accountCenterY - brandCenterY) <= 3,
        `Account avatar must be vertically centered alongside brand at ${width}px`);
    }
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
  console.log('PASS: grid toolbar has one aligned action row and no overlap at 320–1024px');

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

  // Audit all dialogs in the rendered app, not just the markup.
  const dialogIds = await page.locator('dialog').evaluateAll(dialogs => dialogs.map(d => d.id));
  assert.equal(dialogIds.length, 10, 'All ten dialogs should be tested');
  for (const id of dialogIds) {
    await page.evaluate(dialogId => {
      const dialog = document.getElementById(dialogId);
      // Force a prior confirmation result to catch accidental destructive closes.
      dialog.returnValue = 'confirm';
      dialog.showModal();
    }, id);
    const closeButton = page.locator(id === 'authDialog' ? '#authClose' : `#${id} [data-dialog-close]`);
    await closeButton.waitFor({ state: 'visible' });
    const geometry = await closeButton.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const modal = button.closest('dialog').getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, left: bounds.left,
        right: bounds.right, top: bounds.top, modalLeft: modal.left,
        modalRight: modal.right, modalTop: modal.top };
    });
    assert(geometry.width >= 36 && geometry.height >= 36,
      `${id} needs a touch-sized, visible close button`);
    assert(geometry.left >= geometry.modalLeft - 1 &&
      geometry.right <= geometry.modalRight + 1 &&
      geometry.top >= geometry.modalTop - 1,
      `${id} close button must remain within the dialog header`);
    await closeButton.click();
    await page.locator(`#${id}[open]`).waitFor({ state: 'hidden' });
    assert.equal(await page.locator(`#${id}`).evaluate(dialog => dialog.returnValue), 'cancel',
      `${id} close button must cancel, not confirm`);
  }
  console.log('PASS: every dialog has a working, touch-sized X that cancels safely');

  for (const width of [320, 360, 390, 414, 720]) {
    await page.setViewportSize({ width, height: 844 });
    const signedIn = await page.evaluate(() => {
      const select = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return {
        width: window.innerWidth,
        brand: select('.topbar-brand'),
        account: select('#accountBtn'),
        status: select('#syncStatus'),
        header: select('.topbar'),
      };
    });
    assert(signedIn.account.left >= 0 && signedIn.account.right <= signedIn.width,
      `Signed-in account must remain on-screen at ${width}px`);
    assert(Math.min(signedIn.account.right, signedIn.brand.right)
        - Math.max(signedIn.account.left, signedIn.brand.left) <= 0
        || Math.min(signedIn.account.bottom, signedIn.brand.bottom)
        - Math.max(signedIn.account.top, signedIn.brand.top) <= 0,
      `Signed-in account must not overlap brand at ${width}px`);
    assert(signedIn.status.right <= signedIn.width + 1,
      `Sync status must remain on-screen at ${width}px`);
    assert(signedIn.account.right - signedIn.account.left <= 50,
      `Signed-in account should show avatar only at ${width}px`);
    assert(signedIn.status.top < signedIn.header.bottom - 30,
      `Sync status should sit below the app name rather than under the action buttons at ${width}px`);
    assert(signedIn.account.bottom <= signedIn.header.bottom + 1,
      `Account button must fit in the header at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/tubetally-mobile-header.png' });
  console.log('PASS: account shows signup-only invitations and no organizations; signed-in toolbar fits');

  const fieldName = `Personal UI test ${Date.now()}`;
  await page.locator('#fieldNameLabel').click();
  await page.locator('#fieldNameDialogInput').fill(fieldName);
  await page.locator('#fieldNameForm button').last().click();
  await page.locator('#btnGood').click();
  // A row press vibrates and opens the editor together, never on a brief tap.
  await page.evaluate(() => {
    window.__editFeedback = [];
    navigator.vibrate = duration => { window.__editFeedback.push(duration); return true; };
  });
  const firstHistoryRow = page.locator('#history [data-row="1"]');
  await firstHistoryRow.hover();
  await page.mouse.down();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#changeRowDialog[open]').count(), 0,
    'Short hold must not open row editor');
  await page.waitForTimeout(210);
  assert.equal(await page.locator('#changeRowDialog[open]').count(), 1,
    'Row editor must open after the 500ms hold');
  assert.deepEqual(await page.evaluate(() => window.__editFeedback), [18],
    'One haptic pulse must occur at editor opening');
  await page.mouse.up();
  assert.deepEqual(await page.locator('#changeRowDialog [data-change-status]').evaluateAll(
    buttons => buttons.map(button => button.dataset.changeStatus)),
    ['red', 'green', 'yellow'], 'Editor must show Slow / Good / Fast in main-button order');
  await page.locator('#changeRowDialog [data-dialog-close]').click();
  assert.equal(await page.locator('#changeRowDialog[open]').count(), 0);
  assert.equal(await page.locator('#history [data-row="1"] .history-badge').textContent(), 'Good',
    'Exiting row edit must not change recorded status');
  // Reopen through the real hold gesture and confirm the choices remain functional.
  await firstHistoryRow.hover();
  await page.mouse.down();
  await page.waitForTimeout(540);
  await page.mouse.up();
  await page.locator('#changeRowDialog [data-change-status="red"]').click();
  assert.equal(await page.locator('#history [data-row="1"] .history-badge').textContent(), 'Slow',
    'Selecting Slow must update the recorded status');
  console.log('PASS: edit haptic and dialog coincide at 500ms; choices are ordered Slow / Good / Fast');
  createdRunId = await page.evaluate(() => JSON.parse(localStorage.getItem('tubetally.v1'))?.runId);
  await page.locator('#savedFieldsBtn').click();
  await page.locator('#saveFieldBtn').click();
  await page.waitForFunction(name =>
    document.querySelector('#savedFieldsList')?.textContent?.includes(name), fieldName);
  console.log('PASS: personal field appears in saved fields');

  // Verify the user has two explicit sharing formats, including native and copy paths.
  await page.evaluate(() => {
    window.__nativeShared = [];
    window.__clipboardShared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true, value: async payload => { window.__nativeShared.push(payload); },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__clipboardShared.push(value); } },
    });
  });
  const fieldRow = page.locator('#savedFieldsList .saved-field-item').filter({ hasText: fieldName });
  async function openFieldShare() {
    await fieldRow.locator('[data-action="share"]').click();
    await page.locator('#shareDialog[open]').waitFor();
  }

  await openFieldShare();
  const textPreview = await page.locator('#shareTextPreview').textContent();
  assert(textPreview.includes(`Field: ${fieldName}`), 'Text preview must include field name');
  assert(textPreview.includes('Slow (1 rows): 1'), 'Text report must contain actual row history');
  await page.locator('#shareTextBtn').click();
  await page.locator('#shareDialog[open]').waitFor({ state: 'hidden' });
  const textNative = await page.evaluate(() => window.__nativeShared.at(-1));
  assert.equal(textNative.text, textPreview, 'Native share text must contain the full readable report');
  assert.equal(textNative.url, undefined, 'Text-only share must not append an edit URL');

  await openFieldShare();
  await page.locator('#shareLinkBtn').click();
  await page.locator('#shareDialog[open]').waitFor({ state: 'hidden' });
  const linkNative = await page.evaluate(() => window.__nativeShared.at(-1));
  assert(linkNative.url.includes('d=1.'), 'Native share link must embed the report payload');
  assert.equal(linkNative.text, undefined, 'Editable link share must not add redundant report text');

  await openFieldShare();
  await page.locator('#copyShareTextBtn').click();
  await page.locator('#shareDialog[open]').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__clipboardShared.at(-1)), textPreview,
    'Copy text must copy the readable report, without a URL');

  await openFieldShare();
  await page.locator('#copyShareLinkBtn').click();
  await page.locator('#shareDialog[open]').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__clipboardShared.at(-1)), linkNative.url,
    'Copy link must copy the same independent editable field URL');
  console.log('PASS: native share and copy each support complete text reports and independent links');

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
