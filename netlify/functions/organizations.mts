import { getDatabase } from '@netlify/database';
import { admin, getIdentityConfig, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config, Context } from '@netlify/functions';
import {
  auditOrganizationEvent,
  requireOrganizationAdmin,
  OrganizationAuthorizationError,
} from './_shared/organization-access.mjs';
import {
  normalizeEmail,
  OrganizationValidationError,
  requiredUuid,
  validateCreateOrganization,
  validateInvite,
  validateInvitePreference,
  validateMembershipUpdate,
} from './_shared/organization-validation.mjs';

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

async function withClient<T>(operation: (client: any) => Promise<T>) {
  const client = await getDatabase().pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

async function findIdentityUserByEmail(email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const users = await admin.listUsers({ page, perPage: 100 });
    const found = users.find((candidate) => candidate.email?.toLocaleLowerCase('en-US') === email);
    if (found) return found;
    if (users.length < 100) return null;
  }
  throw new Error('Identity user search exceeded the supported page limit.');
}

async function inviteIdentityUser(email: string) {
  const config = getIdentityConfig();
  if (!config?.url || !config.token) throw new Error('Netlify Identity operator access is unavailable.');
  const response = await fetch(`${config.url}/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.msg || `Netlify Identity invitation failed (${response.status}).`);
  }
  return response.json().catch(() => null);
}

async function listOrganizations(identityUserId: string, email: string) {
  return withClient(async (client) => {
    const [organizations, preference, invitations] = await Promise.all([
      client.query(
        `SELECT o.id, o.name, o.created_at, m.role,
                COUNT(active_members.identity_user_id)::integer AS member_count
           FROM organization_members m
           JOIN organizations o ON o.id = m.organization_id AND o.archived_at IS NULL
      LEFT JOIN organization_members active_members
             ON active_members.organization_id = o.id AND active_members.removed_at IS NULL
          WHERE m.identity_user_id = $1 AND m.removed_at IS NULL
          GROUP BY o.id, o.name, o.created_at, m.role
          ORDER BY o.name`,
        [identityUserId],
      ),
      client.query(
        `SELECT block_organization_invites
           FROM organization_user_preferences
          WHERE identity_user_id = $1`,
        [identityUserId],
      ),
      client.query(
        `SELECT i.id, i.organization_id, o.name AS organization_name, i.expires_at, i.created_at
           FROM organization_invitations i
           JOIN organizations o ON o.id = i.organization_id AND o.archived_at IS NULL
          WHERE i.normalized_email = $1
            AND i.status = 'pending'
            AND i.expires_at > NOW()
          ORDER BY i.created_at`,
        [normalizeEmail(email)],
      ),
    ]);
    return {
      organizations: organizations.rows,
      blockOrganizationInvites: preference.rows[0]?.block_organization_invites || false,
      invitations: invitations.rows,
    };
  });
}

async function createOrganization(identityUserId: string, input: unknown) {
  const organization = validateCreateOrganization(input);
  return withClient(async (client) => {
    const organizationId = crypto.randomUUID();
    const scopeId = crypto.randomUUID();
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO organizations (id, name, normalized_name)
         VALUES ($1, $2, $3)`,
        [organizationId, organization.name, organization.normalizedName],
      );
      await client.query(
        `INSERT INTO data_scopes (id, scope_type, organization_id)
         VALUES ($1, 'organization', $2)`,
        [scopeId, organizationId],
      );
      await client.query(
        `INSERT INTO organization_members (organization_id, identity_user_id, role)
         VALUES ($1, $2, 'admin')`,
        [organizationId, identityUserId],
      );
      await auditOrganizationEvent(client, {
        organizationId,
        actorIdentityUserId: identityUserId,
        eventType: 'organization.created',
      });
      await client.query('COMMIT');
      return { id: organizationId, name: organization.name, role: 'admin', member_count: 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function listMembers(identityUserId: string, organizationId: string) {
  return withClient(async (client) => {
    await requireOrganizationAdmin(client, organizationId, identityUserId);
    const members = await client.query(
      `SELECT identity_user_id, role, joined_at
         FROM organization_members
        WHERE organization_id = $1 AND removed_at IS NULL
        ORDER BY role DESC, joined_at`,
      [requiredUuid(organizationId, 'organizationId')],
    );
    const users = await Promise.all(members.rows.map(async (member: any) => {
      const user = await admin.getUser(member.identity_user_id);
      return {
        id: member.identity_user_id,
        email: user.email,
        name: user.name || user.userMetadata?.full_name || '',
        role: member.role,
        joinedAt: member.joined_at,
      };
    }));
    const invitations = await client.query(
      `SELECT id, email, status, expires_at, created_at
         FROM organization_invitations
        WHERE organization_id = $1 AND status IN ('pending', 'delivery_failed')
        ORDER BY created_at DESC`,
      [requiredUuid(organizationId, 'organizationId')],
    );
    return { members: users, invitations: invitations.rows };
  });
}

async function createInvitation(identityUserId: string, organizationId: string, input: unknown) {
  const { email } = validateInvite(input);
  return withClient(async (client) => {
    await requireOrganizationAdmin(client, organizationId, identityUserId);
    const identityUser = await findIdentityUserByEmail(email);
    if (identityUser) {
      const matches = await client.query(
        `SELECT 1 FROM organization_members
          WHERE organization_id = $1 AND identity_user_id = $2 AND removed_at IS NULL`,
        [organizationId, identityUser.id],
      );
      if (matches.rows[0]) throw new OrganizationValidationError('That person is already a member.');
    }
    if (identityUser) {
      const preferences = await client.query(
        `SELECT block_organization_invites
           FROM organization_user_preferences
          WHERE identity_user_id = $1`,
        [identityUser.id],
      );
      if (preferences.rows[0]?.block_organization_invites) {
        throw new OrganizationValidationError('That person does not accept organization invitations.');
      }
    }

    const invitationId = crypto.randomUUID();
    await client.query(
      `INSERT INTO organization_invitations
         (id, organization_id, email, normalized_email, invited_by_identity_user_id, identity_user_id)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [invitationId, requiredUuid(organizationId, 'organizationId'), email, identityUserId, identityUser?.id || null],
    );
    await auditOrganizationEvent(client, {
      organizationId,
      actorIdentityUserId: identityUserId,
      eventType: 'member.invited',
      subjectIdentityUserId: identityUser?.id || null,
      metadata: { email },
    });

    if (!identityUser) {
      try {
        await inviteIdentityUser(email);
      } catch (error) {
        await client.query(
          `UPDATE organization_invitations
              SET status = 'delivery_failed', updated_at = NOW()
            WHERE id = $1`,
          [invitationId],
        );
        throw error;
      }
    }
    return { id: invitationId, email, status: 'pending', identityInvitationSent: !identityUser };
  });
}

async function respondToInvitation(identityUserId: string, email: string, invitationId: string, action: string) {
  if (!['accept', 'decline'].includes(action)) throw new OrganizationValidationError('Action must be accept or decline.');
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const invite = await client.query(
        `SELECT id, organization_id, normalized_email
           FROM organization_invitations
          WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
          FOR UPDATE`,
        [requiredUuid(invitationId, 'invitationId')],
      );
      if (!invite.rows[0] || invite.rows[0].normalized_email !== normalizeEmail(email)) {
        throw new OrganizationValidationError('Organization invitation was not found.');
      }
      const item = invite.rows[0];
      const status = action === 'accept' ? 'accepted' : 'declined';
      await client.query(
        `UPDATE organization_invitations
            SET status = $2, identity_user_id = $3, responded_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [item.id, status, identityUserId],
      );
      if (action === 'accept') {
        await client.query(
          `INSERT INTO organization_members (organization_id, identity_user_id, role, removed_at)
           VALUES ($1, $2, 'member', NULL)
           ON CONFLICT (organization_id, identity_user_id)
           DO UPDATE SET role = 'member', removed_at = NULL, joined_at = NOW()`,
          [item.organization_id, identityUserId],
        );
      }
      await auditOrganizationEvent(client, {
        organizationId: item.organization_id,
        actorIdentityUserId: identityUserId,
        eventType: action === 'accept' ? 'member.invitation_accepted' : 'member.invitation_declined',
        subjectIdentityUserId: identityUserId,
      });
      await client.query('COMMIT');
      return { organizationId: item.organization_id, status };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function updateMembership(identityUserId: string, organizationId: string, memberId: string, input: unknown) {
  const { role } = validateMembershipUpdate(input);
  return withClient(async (client) => {
    await requireOrganizationAdmin(client, organizationId, identityUserId);
    const targetId = requiredUuid(memberId, 'memberId');
    const target = await client.query(
      `SELECT role FROM organization_members
        WHERE organization_id = $1 AND identity_user_id = $2 AND removed_at IS NULL`,
      [requiredUuid(organizationId, 'organizationId'), targetId],
    );
    if (!target.rows[0]) throw new OrganizationValidationError('Member was not found.');
    if (target.rows[0].role === 'admin' && role === 'member') {
      const admins = await client.query(
        `SELECT COUNT(*)::integer AS count FROM organization_members
          WHERE organization_id = $1 AND role = 'admin' AND removed_at IS NULL`,
        [organizationId],
      );
      if (admins.rows[0].count <= 1) throw new OrganizationValidationError('An organization must have at least one admin.');
    }
    await client.query(
      `UPDATE organization_members SET role = $3
        WHERE organization_id = $1 AND identity_user_id = $2`,
      [organizationId, targetId, role],
    );
    await auditOrganizationEvent(client, {
      organizationId,
      actorIdentityUserId: identityUserId,
      eventType: 'member.role_changed',
      subjectIdentityUserId: targetId,
      metadata: { role },
    });
    return { id: targetId, role };
  });
}

async function removeMembership(identityUserId: string, organizationId: string, memberId: string) {
  return withClient(async (client) => {
    await requireOrganizationAdmin(client, organizationId, identityUserId);
    const targetId = requiredUuid(memberId, 'memberId');
    const target = await client.query(
      `SELECT role FROM organization_members
        WHERE organization_id = $1 AND identity_user_id = $2 AND removed_at IS NULL`,
      [requiredUuid(organizationId, 'organizationId'), targetId],
    );
    if (!target.rows[0]) throw new OrganizationValidationError('Member was not found.');
    if (target.rows[0].role === 'admin') {
      const admins = await client.query(
        `SELECT COUNT(*)::integer AS count FROM organization_members
          WHERE organization_id = $1 AND role = 'admin' AND removed_at IS NULL`,
        [organizationId],
      );
      if (admins.rows[0].count <= 1) throw new OrganizationValidationError('An organization must have at least one admin.');
    }
    await client.query(
      `UPDATE organization_members SET removed_at = NOW()
        WHERE organization_id = $1 AND identity_user_id = $2`,
      [organizationId, targetId],
    );
    await auditOrganizationEvent(client, {
      organizationId,
      actorIdentityUserId: identityUserId,
      eventType: 'member.removed',
      subjectIdentityUserId: targetId,
    });
    return { removed: true };
  });
}

async function updateInvitePreference(identityUserId: string, input: unknown) {
  const { blockOrganizationInvites } = validateInvitePreference(input);
  return withClient(async (client) => {
    await client.query(
      `INSERT INTO organization_user_preferences (identity_user_id, block_organization_invites)
       VALUES ($1, $2)
       ON CONFLICT (identity_user_id)
       DO UPDATE SET block_organization_invites = EXCLUDED.block_organization_invites, updated_at = NOW()`,
      [identityUserId, blockOrganizationInvites],
    );
    return { blockOrganizationInvites };
  });
}

async function cancelInvitation(identityUserId: string, invitationId: string) {
  return withClient(async (client) => {
    const invite = await client.query(
      `SELECT organization_id, identity_user_id
         FROM organization_invitations
        WHERE id = $1 AND status IN ('pending', 'delivery_failed')`,
      [requiredUuid(invitationId, 'invitationId')],
    );
    if (!invite.rows[0]) throw new OrganizationValidationError('Organization invitation was not found.');
    const item = invite.rows[0];
    await requireOrganizationAdmin(client, item.organization_id, identityUserId);
    await client.query(
      `UPDATE organization_invitations
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1`,
      [invitationId],
    );
    await auditOrganizationEvent(client, {
      organizationId: item.organization_id,
      actorIdentityUserId: identityUserId,
      eventType: 'member.invitation_cancelled',
      subjectIdentityUserId: item.identity_user_id,
    });
    return { cancelled: true };
  });
}

export default async (req: Request, context: Context) => {
  const user = await getUser();
  if (!user?.id || !user.email) return json({ error: 'Unauthorized' }, 401);
  const organizationId = context.params.organizationId;
  const memberId = context.params.memberId;
  const invitationId = context.params.invitationId;

  try {
    if (req.method !== 'GET') verifyRequestOrigin(req);
    if (req.method === 'GET' && !organizationId) return json(await listOrganizations(user.id, user.email));
    if (req.method === 'POST' && !organizationId) return json(await createOrganization(user.id, await req.json()), 201);
    if (req.method === 'GET' && organizationId && !memberId && !invitationId) return json(await listMembers(user.id, organizationId));
    if (req.method === 'POST' && organizationId && !memberId && !invitationId) return json(await createInvitation(user.id, organizationId, await req.json()), 201);
    if (req.method === 'PATCH' && organizationId && memberId) return json(await updateMembership(user.id, organizationId, memberId, await req.json()));
    if (req.method === 'DELETE' && organizationId && memberId) return json(await removeMembership(user.id, organizationId, memberId));
    if (req.method === 'POST' && invitationId) {
      const body = await req.json();
      return json(await respondToInvitation(user.id, user.email, invitationId, body.action));
    }
    if (req.method === 'DELETE' && invitationId) return json(await cancelInvitation(user.id, invitationId));
    if (req.method === 'PUT' && !organizationId && !invitationId) return json(await updateInvitePreference(user.id, await req.json()));
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    if (error instanceof OrganizationAuthorizationError) return json({ error: error.message }, 403);
    if (error instanceof OrganizationValidationError || error instanceof SyntaxError) return json({ error: error.message }, 400);
    console.error('Organization request failed', { requestId: context.requestId, error });
    return json({ error: 'Unable to access organizations' }, 500);
  }
};

export const config: Config = {
  path: [
    '/api/organizations',
    '/api/organizations/:organizationId',
    '/api/organizations/:organizationId/members/:memberId',
    '/api/organization-invitations/:invitationId',
  ],
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
};
