export async function routeOrganizationRequest({ request, params, actions }) {
  const organizationId = params.organizationId;
  const memberId = params.memberId;
  const invitationId = params.invitationId;

  if (request.method === 'GET' && !organizationId && !invitationId) return actions.listOrganizations();
  if (request.method === 'POST' && invitationId) return actions.respondToInvitation(invitationId, await request.json());
  if (request.method === 'DELETE' && invitationId) return actions.cancelInvitation(invitationId);
  if (request.method === 'POST' && !organizationId && !invitationId) return actions.createOrganization(await request.json());
  if (request.method === 'GET' && organizationId && !memberId) return actions.listMembers(organizationId);
  if (request.method === 'POST' && organizationId && !memberId) return actions.createInvitation(organizationId, await request.json());
  if (request.method === 'PATCH' && organizationId && memberId) return actions.updateMembership(organizationId, memberId, await request.json());
  if (request.method === 'DELETE' && organizationId && memberId) return actions.removeMembership(organizationId, memberId);
  if (request.method === 'PUT' && !organizationId && !invitationId) return actions.updateInvitePreference(await request.json());
  return null;
}
