import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { spawn } from 'node:child_process';

test('runs the complete organization integration flow against an HTTP API', async () => {
  const state = { organization: null, invitations: [], members: [{ id: 'admin-id', email: 'admin@example.test', role: 'admin' }] };
  const server = http.createServer(async (req, res) => {
    const body = await new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
    });
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const token = req.headers.authorization?.replace('Bearer ', '');
    const isAdmin = token === 'admin-token';

    if (req.url === '/.netlify/identity/token') {
      const credentials = new URLSearchParams(body);
      return json(200, { access_token: credentials.get('username') === 'admin@example.test' ? 'admin-token' : 'member-token' });
    }
    if (req.url === '/api/organizations' && req.method === 'GET') {
      return json(200, {
        organizations: state.organization && (isAdmin || state.members.some((member) => member.id === 'member-id'))
          ? [{ ...state.organization, role: isAdmin ? 'admin' : 'member' }]
          : [],
        invitations: isAdmin ? [] : state.invitations.filter((item) => item.email === 'member@example.test'),
      });
    }
    if (req.url === '/api/organizations' && req.method === 'POST') {
      state.organization = { id: 'org-id', name: JSON.parse(body).name };
      return json(201, { ...state.organization, role: 'admin' });
    }
    if (req.url === '/api/organizations/org-id' && req.method === 'GET') return json(200, { members: state.members, invitations: state.invitations });
    if (req.url === '/api/organizations/org-id' && req.method === 'POST') {
      const invitation = { id: 'invite-id', email: JSON.parse(body).email, status: 'pending' };
      state.invitations.push(invitation);
      return json(201, invitation);
    }
    if (req.url === '/api/organization-invitations/invite-id' && req.method === 'POST') {
      state.invitations = [];
      state.members.push({ id: 'member-id', email: 'member@example.test', role: 'member' });
      return json(200, { status: 'accepted' });
    }
    if (req.url === '/api/organizations/org-id/members/member-id' && req.method === 'PATCH') {
      state.members.find((member) => member.id === 'member-id').role = JSON.parse(body).role;
      return json(200, {});
    }
    if (req.url === '/api/organizations/org-id/members/member-id' && req.method === 'DELETE') {
      state.members = state.members.filter((member) => member.id !== 'member-id');
      return json(200, { removed: true });
    }
    return json(404, { error: `${req.method} ${req.url}` });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const child = spawn(process.execPath, ['tools/test-organizations-integration.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TUBETALLY_E2E_URL: `http://127.0.0.1:${port}`,
      TUBETALLY_E2E_ADMIN_EMAIL: 'admin@example.test',
      TUBETALLY_E2E_ADMIN_PASSWORD: 'admin-password',
      TUBETALLY_E2E_MEMBER_EMAIL: 'member@example.test',
      TUBETALLY_E2E_MEMBER_PASSWORD: 'member-password',
    },
  });
  const [code] = await once(child, 'exit');
  await new Promise((resolve) => server.close(resolve));
  assert.equal(code, 0);
  assert.deepEqual(state.members, [{ id: 'admin-id', email: 'admin@example.test', role: 'admin' }]);
});
