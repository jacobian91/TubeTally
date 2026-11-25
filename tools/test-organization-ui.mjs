import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const baseUrl = process.env.TUBETALLY_E2E_URL;
const email = process.env.TUBETALLY_E2E_ADMIN_EMAIL;
const password = process.env.TUBETALLY_E2E_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) throw new Error('Missing UI test configuration.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const requests = [];
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('response', response => {
  if (/\/api\/organizations(?:\/|$)/.test(new URL(response.url()).pathname)) {
    requests.push(`${response.request().method()} ${new URL(response.url()).pathname} => ${response.status()}`);
  }
});

const orgName = `TubeTally UI CI ${randomUUID().slice(0, 8)}`;
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#accountBtn').click();
  await page.locator('#authEmail').fill(email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authSubmit').click();
  await page.waitForFunction(() => !!window.tubeTallyUser?.id, { timeout: 20000 });
  assert.equal(await page.locator('#authError').isVisible(), false, 'Login must succeed');

  await page.locator('#accountBtn').click();
  await page.locator('#authOrganizations').click();
  await page.locator('#organizationsDialog[open]').waitFor();

  await page.locator('#createOrganizationName').fill(orgName);
  const createResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/organizations'
    && response.request().method() === 'POST',
  );
  await page.locator('#createOrganizationForm button[type=submit]').click();
  const response = await createResponse;
  assert.equal(response.status(), 201, 'Organization creation should succeed');

  // Check the actual rendered UI, not merely successful API creation.
  await page.waitForFunction(name =>
    [...document.querySelectorAll('#organizationsList .card')].some(row => row.textContent.includes(name)),
    orgName, { timeout: 10000 });
  console.log('PASS: created organization appears in visible organization list');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.tubeTallyUser?.id, { timeout: 20000 });
  await page.locator('#accountBtn').click();
  await page.locator('#authOrganizations').click();
  await page.locator('#organizationsDialog[open]').waitFor();

  await page.waitForFunction(name =>
    [...document.querySelectorAll('#organizationsList .card')].some(row => row.textContent.includes(name)),
    orgName, { timeout: 10000 });

  const data = await page.evaluate(async () => {
    const response = await fetch('/api/organizations', { credentials: 'same-origin', cache: 'no-store' });
    return { status: response.status, json: await response.json() };
  });
  assert.equal(data.status, 200, 'Organizations API must be readable after reload');
  assert(data.json.organizations.some(org => org.name === orgName && org.role === 'admin'),
    'Created organization must persist in database with admin membership');
  console.log('PASS: organization stays visible after reload and is persisted in the API');
} catch (error) {
  console.error('UI test failed:', error.message);
  console.error('Organization API requests:', requests.join(' | '));
  console.error('Browser errors:', pageErrors.slice(-8).join(' | '));
  console.error('Current user available:', await page.evaluate(() => !!window.tubeTallyUser?.id).catch(() => false));
  console.error('Organization row count:', await page.locator('#organizationsList .card').count().catch(() => -1));
  await page.screenshot({ path: '/tmp/organization-ui-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
