import test from 'node:test';
import assert from 'node:assert/strict';
import { routeOrganizationRequest } from '../netlify/functions/_shared/organization-routing.mjs';

function request(method, body) {
  return new Request('https://example.test/api/organizations', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

function actions(calls) {
  return Object.fromEntries([
    'listOrganizations', 'respondToInvitation', 'cancelInvitation', 'createOrganization',
    'listMembers', 'createInvitation', 'updateMembership', 'removeMembership', 'updateInvitePreference',
  ].map((name) => [name, (...args) => { calls.push([name, ...args]); return name; }]));
}

test('routes organization creation only from the collection endpoint', async () => {
  const calls = [];
  const result = await routeOrganizationRequest({
    request: request('POST', { name: 'Erickson Farm' }), params: {}, actions: actions(calls),
  });
  assert.equal(result, 'createOrganization');
  assert.deepEqual(calls, [['createOrganization', { name: 'Erickson Farm' }]]);
});

test('routes invitation responses ahead of collection creation', async () => {
  const calls = [];
  const result = await routeOrganizationRequest({
    request: request('POST', { action: 'accept' }), params: { invitationId: 'invite-1' }, actions: actions(calls),
  });
  assert.equal(result, 'respondToInvitation');
  assert.deepEqual(calls, [['respondToInvitation', 'invite-1', { action: 'accept' }]]);
});

test('routes membership updates and removal to their exact member', async () => {
  const params = { organizationId: 'org-1', memberId: 'member-1' };
  const updateCalls = [];
  await routeOrganizationRequest({ request: request('PATCH', { role: 'admin' }), params, actions: actions(updateCalls) });
  assert.deepEqual(updateCalls, [['updateMembership', 'org-1', 'member-1', { role: 'admin' }]]);

  const removeCalls = [];
  await routeOrganizationRequest({ request: request('DELETE'), params, actions: actions(removeCalls) });
  assert.deepEqual(removeCalls, [['removeMembership', 'org-1', 'member-1']]);
});

test('does not treat invitation URLs as organization creation', async () => {
  const calls = [];
  const result = await routeOrganizationRequest({
    request: request('POST', { action: 'accept' }),
    params: { organizationId: undefined, invitationId: 'invite-1' },
    actions: actions(calls),
  });
  assert.equal(result, 'respondToInvitation');
  assert.equal(calls[0][0], 'respondToInvitation');
});
