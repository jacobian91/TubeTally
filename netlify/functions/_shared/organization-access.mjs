import { OrganizationValidationError, requiredUuid } from './organization-validation.mjs';

export class OrganizationAuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrganizationAuthorizationError';
  }
}

export async function activeMembership(client, organizationId, identityUserId) {
  const result = await client.query(
    `SELECT role
       FROM organization_members
      WHERE organization_id = $1
        AND identity_user_id = $2
        AND removed_at IS NULL`,
    [requiredUuid(organizationId, 'organizationId'), identityUserId],
  );
  return result.rows[0] || null;
}

export async function requireOrganizationMember(client, organizationId, identityUserId) {
  const membership = await activeMembership(client, organizationId, identityUserId);
  if (!membership) throw new OrganizationAuthorizationError('You are not a member of this organization.');
  return membership;
}

export async function requireOrganizationAdmin(client, organizationId, identityUserId) {
  const membership = await requireOrganizationMember(client, organizationId, identityUserId);
  if (membership.role !== 'admin') throw new OrganizationAuthorizationError('Only organization admins can do that.');
  return membership;
}

export async function organizationScopeForMember(client, organizationId, identityUserId) {
  await requireOrganizationMember(client, organizationId, identityUserId);
  const result = await client.query(
    'SELECT id FROM data_scopes WHERE organization_id = $1',
    [requiredUuid(organizationId, 'organizationId')],
  );
  if (!result.rows[0]) throw new OrganizationValidationError('Organization data scope was not found.');
  return result.rows[0].id;
}

/**
 * @param {any} client
 * @param {{ organizationId: string, actorIdentityUserId?: string | null, eventType: string, subjectIdentityUserId?: string | null, metadata?: Record<string, unknown> }} event
 */
export async function auditOrganizationEvent(client, {
  organizationId,
  actorIdentityUserId = null,
  eventType,
  subjectIdentityUserId = null,
  metadata = {},
}) {
  await client.query(
    `INSERT INTO organization_audit_events
       (id, organization_id, actor_identity_user_id, event_type,
        subject_identity_user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      crypto.randomUUID(),
      requiredUuid(organizationId, 'organizationId'),
      actorIdentityUserId,
      eventType,
      subjectIdentityUserId,
      JSON.stringify(metadata),
    ],
  );
}
