import assert from 'node:assert/strict';

const required = [
  'TUBETALLY_E2E_URL',
  'TUBETALLY_E2E_ADMIN_EMAIL',
  'TUBETALLY_E2E_ADMIN_PASSWORD',
  'TUBETALLY_E2E_MEMBER_EMAIL',
  'TUBETALLY_E2E_MEMBER_PASSWORD',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} must be set.`);
}

const baseUrl = process.env.TUBETALLY_E2E_URL.replace(/\/$/, '');
const testOrganizationName = 'TubeTally Integration Test';

async function identityToken(email, password) {
  const response = await fetch(`${baseUrl}/.netlify/identity/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password }),
  });
  if (!response.ok) throw new Error(`Identity login failed for ${email} (${response.status}).`);
  const body = await response.json();
  if (!body.access_token) throw new Error(`Identity login returned no access token for ${email}.`);
  return body.access_token;
}

async function request(token, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: baseUrl,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${payload.error || 'unknown error'}`);
  return payload;
}

const adminToken = await identityToken(process.env.TUBETALLY_E2E_ADMIN_EMAIL, process.env.TUBETALLY_E2E_ADMIN_PASSWORD);
const memberToken = await identityToken(process.env.TUBETALLY_E2E_MEMBER_EMAIL, process.env.TUBETALLY_E2E_MEMBER_PASSWORD);

const initial = await request(adminToken, '/api/organizations');
let organization = initial.organizations.find((item) => item.name === testOrganizationName);
if (!organization) {
  organization = await request(adminToken, '/api/organizations', {
    method: 'POST', body: { name: testOrganizationName },
  });
}
assert.equal(organization.role, 'admin', 'The test admin must administer the integration-test organization.');

let membership = await request(adminToken, `/api/organizations/${organization.id}`);
const existingMember = membership.members.find((item) => item.email === process.env.TUBETALLY_E2E_MEMBER_EMAIL);
if (existingMember) {
  await request(adminToken, `/api/organizations/${organization.id}/members/${existingMember.id}`, { method: 'DELETE' });
  membership = await request(adminToken, `/api/organizations/${organization.id}`);
}
for (const invitation of membership.invitations.filter((item) => item.email === process.env.TUBETALLY_E2E_MEMBER_EMAIL)) {
  await request(adminToken, `/api/organization-invitations/${invitation.id}`, { method: 'DELETE' });
}

const invitation = await request(adminToken, `/api/organizations/${organization.id}`, {
  method: 'POST', body: { email: process.env.TUBETALLY_E2E_MEMBER_EMAIL },
});
const memberState = await request(memberToken, '/api/organizations');
assert(memberState.invitations.some((item) => item.id === invitation.id), 'The member must receive the invitation.');

await request(memberToken, `/api/organization-invitations/${invitation.id}`, {
  method: 'POST', body: { action: 'accept' },
});
membership = await request(adminToken, `/api/organizations/${organization.id}`);
const joinedMember = membership.members.find((item) => item.email === process.env.TUBETALLY_E2E_MEMBER_EMAIL);
assert(joinedMember, 'The member must be visible after accepting the invitation.');
assert.equal(joinedMember.role, 'member');

await request(adminToken, `/api/organizations/${organization.id}/members/${joinedMember.id}`, {
  method: 'PATCH', body: { role: 'admin' },
});
membership = await request(adminToken, `/api/organizations/${organization.id}`);
assert.equal(membership.members.find((item) => item.id === joinedMember.id)?.role, 'admin');

await request(adminToken, `/api/organizations/${organization.id}/members/${joinedMember.id}`, {
  method: 'PATCH', body: { role: 'member' },
});
await request(adminToken, `/api/organizations/${organization.id}/members/${joinedMember.id}`, { method: 'DELETE' });
membership = await request(adminToken, `/api/organizations/${organization.id}`);
assert(!membership.members.some((item) => item.id === joinedMember.id), 'The admin must be able to remove the member.');

console.log('Organization integration test passed.');
