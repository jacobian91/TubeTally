const API_URL = '/api/organizations';

const accountOrganizationsButton = document.getElementById('authOrganizations');
const organizationsDialog = document.getElementById('organizationsDialog');
const organizationsList = document.getElementById('organizationsList');
const createOrganizationForm = document.getElementById('createOrganizationForm');
const createOrganizationName = document.getElementById('createOrganizationName');
const membersDialog = document.getElementById('organizationMembersDialog');
const membersTitle = document.getElementById('organizationMembersTitle');
const membersList = document.getElementById('organizationMembersList');
const inviteForm = document.getElementById('organizationInviteForm');
const inviteEmail = document.getElementById('organizationInviteEmail');
const invitationDialog = document.getElementById('organizationInviteDialog');
const invitationMessage = document.getElementById('organizationInviteMessage');
const organizationSelect = document.getElementById('fieldOrganizationSelect');
const organizationSelectGroup = document.getElementById('fieldOrganizationGroup');
const blockInvitesGroup = document.getElementById('blockOrganizationInvitesGroup');
const blockInvitesToggle = document.getElementById('blockOrganizationInvitesToggle');

let currentUser = null;
let organizations = [];
let pendingInvitations = [];
let blockOrganizationInvites = false;
let selectedOrganization = null;
let activeInvitation = null;
let refreshTimer = null;

window.tubeTallyOrganizations = {
  getRole: (organizationId) => organizations.find(org => org.id === organizationId)?.role || null,
  list: () => [...organizations],
};

function notice(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

function reportError(error) {
  console.warn('Organization action failed', error);
  notice(error?.message || 'Unable to update organization');
}

async function request(path = '', options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Organization request failed (${response.status}).`);
  return body;
}

function currentSelectionKey() {
  return currentUser?.id ? `tubetally:lastOrganization:${currentUser.id}` : null;
}

function renderSelector() {
  if (!organizationSelect) return;
  const selected = organizationSelect.value || localStorage.getItem(currentSelectionKey() || '') || '';
  organizationSelect.replaceChildren(new Option('Personal fields', ''));
  for (const organization of organizations) {
    organizationSelect.add(new Option(organization.name, organization.id));
  }
  organizationSelect.value = organizations.some(org => org.id === selected) ? selected : '';
  organizationSelectGroup?.classList.toggle('hidden', !currentUser || !organizations.length);
  window.dispatchEvent(new CustomEvent('tubetally:organization-selected', {
    detail: { organizationId: organizationSelect.value || null },
  }));
}

function renderOrganizations() {
  if (!organizationsList) return;
  organizationsList.replaceChildren();
  if (!organizations.length) {
    const empty = document.createElement('p');
    empty.className = 'text-sm opacity-70';
    empty.textContent = 'No organizations yet.';
    organizationsList.append(empty);
    return;
  }
  for (const organization of organizations) {
    const row = document.createElement('div');
    row.className = 'card p-3 flex items-center gap-3';
    const text = document.createElement('div');
    text.className = 'min-w-0 flex-1';
    text.innerHTML = `<div class="font-semibold truncate"></div><div class="text-xs opacity-70"></div>`;
    text.firstElementChild.textContent = organization.name;
    text.lastElementChild.textContent = `${organization.member_count} member${organization.member_count === 1 ? '' : 's'} · ${organization.role}`;
    row.append(text);
    if (organization.role === 'admin') {
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'icon-btn text-sm';
      manage.dataset.surface = '';
      manage.textContent = 'Manage';
      manage.addEventListener('click', () => void openMembers(organization).catch(reportError));
      row.append(manage);
    }
    organizationsList.append(row);
  }
}

async function refreshOrganizations() {
  if (!currentUser) {
    organizations = [];
    pendingInvitations = [];
    renderSelector();
    return;
  }
  const data = await request();
  organizations = data.organizations || [];
  pendingInvitations = data.invitations || [];
  blockOrganizationInvites = !!data.blockOrganizationInvites;
  if (blockInvitesToggle) blockInvitesToggle.checked = blockOrganizationInvites;
  blockInvitesGroup?.classList.remove('hidden');
  renderSelector();
  renderOrganizations();
  window.tubeTallyData?.refreshRemoteFields?.();
  for (const organization of organizations) void window.tubeTallyData?.refreshRemoteFields?.(organization.id);
  showNextInvitation();
}

function showNextInvitation() {
  const invitation = pendingInvitations[0];
  if (!invitation || invitationDialog?.open) return;
  activeInvitation = invitation;
  invitationMessage.textContent = `Join ${invitation.organization_name}? All fields saved there are shared with the organization.`;
  invitationDialog.showModal();
}

async function respondToInvitation(action) {
  const invitation = activeInvitation;
  if (!invitation) throw new Error('This organization invitation is no longer available.');
  const controls = [
    document.getElementById('acceptOrganizationInvite'),
    document.getElementById('declineOrganizationInvite'),
  ].filter(Boolean);
  controls.forEach(control => { control.disabled = true; });
  try {
    const response = await fetch(`/api/organization-invitations/${invitation.id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Organization invitation failed (${response.status}).`);
    }
    activeInvitation = null;
    invitationDialog.close();
    notice(action === 'accept' ? `Joined ${invitation.organization_name}` : 'Invitation declined');
    await refreshOrganizations();
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
}

async function cancelInvitation(invitationId) {
  const response = await fetch(`/api/organization-invitations/${invitationId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Organization invitation failed (${response.status}).`);
  }
}

async function openMembers(organization) {
  selectedOrganization = organization;
  membersTitle.textContent = organization.name;
  membersList.replaceChildren();
  inviteForm.classList.toggle('hidden', organization.role !== 'admin');
  const data = await request(`/${organization.id}`);
  for (const member of data.members || []) {
    const row = document.createElement('div');
    row.className = 'card p-3 flex items-center gap-2';
    const text = document.createElement('div');
    text.className = 'min-w-0 flex-1';
    text.innerHTML = '<div class="font-semibold truncate"></div><div class="text-xs opacity-70"></div>';
    text.firstElementChild.textContent = member.name || member.email;
    text.lastElementChild.textContent = `${member.email} · ${member.role}`;
    row.append(text);
    if (organization.role === 'admin') {
      const role = document.createElement('button');
      role.type = 'button';
      role.className = 'icon-btn text-xs';
      role.textContent = member.role === 'admin' ? 'Make member' : 'Make admin';
      role.addEventListener('click', () => void (async () => {
        await request(`/${organization.id}/members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role: member.role === 'admin' ? 'member' : 'admin' }) });
        await openMembers(organization);
      })().catch(reportError));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn text-xs text-red-600';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => void (async () => {
        await request(`/${organization.id}/members/${member.id}`, { method: 'DELETE' });
        await openMembers(organization);
      })().catch(reportError));
      row.append(role, remove);
    }
    membersList.append(row);
  }
  for (const invitation of data.invitations || []) {
    const pending = document.createElement('div');
    pending.className = 'flex items-center gap-2 text-sm opacity-70 px-1';
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    label.textContent = `${invitation.email} · ${invitation.status.replace('_', ' ')}`;
    pending.append(label);
    if (organization.role === 'admin') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'icon-btn text-xs';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => cancelInvitation(invitation.id)
        .then(() => openMembers(organization))
        .catch(reportError));
      pending.append(cancel);
    }
    membersList.append(pending);
  }
  membersDialog.showModal();
}

accountOrganizationsButton?.addEventListener('click', () => void (async () => {
  await refreshOrganizations();
  organizationsDialog.showModal();
})().catch(reportError));
document.getElementById('organizationsClose')?.addEventListener('click', () => organizationsDialog.close());
document.getElementById('organizationMembersClose')?.addEventListener('click', () => membersDialog.close());

createOrganizationForm?.addEventListener('submit', (event) => void (async () => {
  event.preventDefault();
  const created = await request('', { method: 'POST', body: JSON.stringify({ name: createOrganizationName.value }) });
  createOrganizationForm.reset();
  notice(`${created.name} created`);
  await refreshOrganizations();
})().catch(reportError));

inviteForm?.addEventListener('submit', (event) => void (async () => {
  event.preventDefault();
  if (!selectedOrganization) return;
  await request(`/${selectedOrganization.id}`, { method: 'POST', body: JSON.stringify({ email: inviteEmail.value }) });
  inviteForm.reset();
  notice('Invitation sent');
  await openMembers(selectedOrganization);
})().catch(reportError));

organizationSelect?.addEventListener('change', () => {
  const key = currentSelectionKey();
  if (key) localStorage.setItem(key, organizationSelect.value || '');
  window.dispatchEvent(new CustomEvent('tubetally:organization-selected', {
    detail: { organizationId: organizationSelect.value || null },
  }));
});

document.getElementById('acceptOrganizationInvite')?.addEventListener('click', () => void respondToInvitation('accept').catch(reportError));
document.getElementById('declineOrganizationInvite')?.addEventListener('click', () => void respondToInvitation('decline').catch(reportError));
blockInvitesToggle?.addEventListener('change', () => void (async () => {
  const data = await request('', { method: 'PUT', body: JSON.stringify({ blockOrganizationInvites: blockInvitesToggle.checked }) });
  blockOrganizationInvites = data.blockOrganizationInvites;
  notice(blockOrganizationInvites ? 'Organization invitations blocked' : 'Organization invitations allowed');
})().catch((error) => {
  if (blockInvitesToggle) blockInvitesToggle.checked = blockOrganizationInvites;
  reportError(error);
}));

window.addEventListener('tubetally:auth-change', (event) => {
  currentUser = event.detail?.user || null;
  blockInvitesGroup?.classList.toggle('hidden', !currentUser);
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (currentUser) {
    void refreshOrganizations().catch(error => console.warn('Unable to load organizations', error));
    refreshTimer = setInterval(() => {
      void refreshOrganizations().catch(error => console.warn('Unable to refresh organizations', error));
    }, 15000);
  }
  else {
    organizations = [];
    pendingInvitations = [];
    renderSelector();
  }
});
