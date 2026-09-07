import { getDatabase } from '@netlify/database';
import { getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config, Context } from '@netlify/functions';
import { Buffer } from 'node:buffer';
import {
  ValidationError,
  validateRunId,
  validateSnapshot,
} from './_shared/field-validation.mjs';
import {
  OrganizationAuthorizationError,
  organizationScopeForMember,
  requireOrganizationAdmin,
} from './_shared/organization-access.mjs';

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const encodeStatusData = (value: Uint8Array) => Buffer.from(value).toString('base64url');

async function personalScope(client: any, identityUserId: string) {
  const existing = await client.query(
    'SELECT id FROM data_scopes WHERE identity_user_id = $1',
    [identityUserId],
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const id = crypto.randomUUID();
  const created = await client.query(
    `INSERT INTO data_scopes (id, scope_type, identity_user_id)
     VALUES ($1, 'personal', $2)
     ON CONFLICT (identity_user_id)
     DO UPDATE SET identity_user_id = EXCLUDED.identity_user_id
     RETURNING id`,
    [id, identityUserId],
  );
  return created.rows[0].id as string;
}

async function scopeForRequest(client: any, identityUserId: string, organizationId: string | null = null) {
  if (organizationId) return organizationScopeForMember(client, organizationId, identityUserId);
  return personalScope(client, identityUserId);
}

async function saveSnapshot(identityUserId: string, body: unknown) {
  const snapshot = validateSnapshot(body);
  const db = getDatabase();
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    const scopeId = await scopeForRequest(client, identityUserId, snapshot.organizationId);
    let fieldId: string | null = null;

    if (snapshot.fieldName) {
      fieldId = crypto.randomUUID();
      const field = await client.query(
        `INSERT INTO field_definitions
           (scope_id, id, name, normalized_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (scope_id, normalized_name)
         DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id`,
        [scopeId, fieldId, snapshot.fieldName, snapshot.normalizedFieldName],
      );
      fieldId = field.rows[0].id;
    }

    await client.query(
      `INSERT INTO field_runs
         (scope_id, run_id, field_id, field_name, started_at_local,
          completed_at_local, current_revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (scope_id, run_id)
       DO UPDATE SET
         field_id = COALESCE(EXCLUDED.field_id, field_runs.field_id),
         field_name = EXCLUDED.field_name,
         started_at_local = EXCLUDED.started_at_local,
         completed_at_local = COALESCE(EXCLUDED.completed_at_local, field_runs.completed_at_local),
         current_revision = GREATEST(field_runs.current_revision, EXCLUDED.current_revision),
         updated_at = NOW(),
         deleted_at = NULL`,
      [
        scopeId,
        snapshot.runId,
        fieldId,
        snapshot.fieldName,
        snapshot.startedAt,
        snapshot.snapshotType === 'manual' ? snapshot.savedAt : null,
        snapshot.revision,
      ],
    );

    await client.query(
      `INSERT INTO field_snapshots
         (scope_id, snapshot_id, run_id, snapshot_type, client_revision,
          row_count, encoding_version, status_data, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
         CASE WHEN $4 = 'autosave' THEN NOW() + INTERVAL '2 days' ELSE NULL END)
       ON CONFLICT (scope_id, snapshot_id) DO NOTHING`,
      [
        scopeId,
        snapshot.snapshotId,
        snapshot.runId,
        snapshot.snapshotType,
        snapshot.revision,
        snapshot.rowCount,
        snapshot.encodingVersion,
        snapshot.statusData,
      ],
    );

    await client.query(
      `DELETE FROM field_snapshots
       WHERE snapshot_type = 'autosave'
         AND expires_at <= NOW()`,
    );
    await client.query(
      `DELETE FROM field_snapshots
       WHERE scope_id = $1
         AND run_id = $2
         AND snapshot_type = 'autosave'
         AND snapshot_id IN (
           SELECT snapshot_id
           FROM field_snapshots
           WHERE scope_id = $1
             AND run_id = $2
             AND snapshot_type = 'autosave'
           ORDER BY created_at DESC, snapshot_id DESC
           OFFSET 5
         )`,
      [scopeId, snapshot.runId],
    );

    await client.query('COMMIT');
    return {
      snapshotId: snapshot.snapshotId,
      runId: snapshot.runId,
      snapshotType: snapshot.snapshotType,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listRuns(identityUserId: string, organizationId: string | null = null) {
  const db = getDatabase();
  const client = await db.pool.connect();
  try {
    const scopeId = await scopeForRequest(client, identityUserId, organizationId);
    await client.query(
      `DELETE FROM field_snapshots
       WHERE snapshot_type = 'autosave' AND expires_at <= NOW()`,
    );
    const result = await client.query(
      `WITH latest AS (
         SELECT
           snapshot_id,
           run_id,
           snapshot_type,
           client_revision,
           row_count,
           encoding_version,
           status_data,
           created_at,
           ROW_NUMBER() OVER (
             PARTITION BY run_id
             ORDER BY
               client_revision DESC,
               CASE WHEN snapshot_type = 'manual' THEN 0 ELSE 1 END,
               created_at DESC,
               snapshot_id DESC
           ) AS position
         FROM field_snapshots
         WHERE scope_id = $1
       )
       SELECT
         r.run_id,
         r.field_id,
         r.field_name,
         r.started_at_local,
         r.completed_at_local,
         l.snapshot_id,
         l.snapshot_type,
         l.client_revision,
         l.row_count,
         l.encoding_version,
         l.status_data,
         l.created_at
       FROM field_runs r
       JOIN latest l
         ON l.run_id = r.run_id AND l.position = 1
       WHERE r.scope_id = $1 AND r.deleted_at IS NULL
       ORDER BY l.created_at DESC`,
      [scopeId],
    );

    return result.rows.map((row: any) => ({
      id: row.run_id,
      runId: row.run_id,
      fieldId: row.field_id,
      fieldName: row.field_name,
      startedAt: row.started_at_local,
      savedAt: row.completed_at_local || '',
      snapshotId: row.snapshot_id,
      snapshotType: row.snapshot_type,
      revision: row.client_revision,
      rowCount: row.row_count,
      encodingVersion: row.encoding_version,
      statuses: encodeStatusData(row.status_data),
      cloudBacked: true,
      serverSavedAt: row.created_at,
    }));
  } finally {
    client.release();
  }
}

async function getRunHistory(identityUserId: string, rawRunId: string, organizationId: string | null = null) {
  const runId = validateRunId(rawRunId);
  const db = getDatabase();
  const client = await db.pool.connect();
  try {
    const scopeId = await scopeForRequest(client, identityUserId, organizationId);
    const result = await client.query(
      `SELECT
         snapshot_id,
         snapshot_type,
         client_revision,
         row_count,
         encoding_version,
         status_data,
         created_at,
         expires_at
       FROM field_snapshots
       WHERE scope_id = $1
         AND run_id = $2
         AND (snapshot_type = 'manual' OR expires_at > NOW())
       ORDER BY created_at DESC, snapshot_id DESC`,
      [scopeId, runId],
    );
    return result.rows.map((row: any) => ({
      snapshotId: row.snapshot_id,
      snapshotType: row.snapshot_type,
      revision: row.client_revision,
      rowCount: row.row_count,
      encodingVersion: row.encoding_version,
      statuses: encodeStatusData(row.status_data),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  } finally {
    client.release();
  }
}

async function deleteRun(identityUserId: string, rawRunId: string, organizationId: string | null = null) {
  const runId = validateRunId(rawRunId);
  const db = getDatabase();
  const client = await db.pool.connect();
  try {
    if (organizationId) await requireOrganizationAdmin(client, organizationId, identityUserId);
    const scopeId = await scopeForRequest(client, identityUserId, organizationId);
    const result = await client.query(
      `DELETE FROM field_runs
       WHERE scope_id = $1 AND run_id = $2
       RETURNING run_id`,
      [scopeId, runId],
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

export default async (req: Request, context: Context) => {
  const user = await getUser();
  if (!user?.id) return json({ error: 'Unauthorized' }, 401);

  try {
    const runId = context.params.id;
    const organizationId = new URL(req.url).searchParams.get('organizationId');
    if (req.method !== 'GET') verifyRequestOrigin(req);
    if (req.method === 'GET' && runId) return json({ snapshots: await getRunHistory(user.id, runId, organizationId) });
    if (req.method === 'GET') return json({ fields: await listRuns(user.id, organizationId) });
    if (req.method === 'POST' && !runId) return json(await saveSnapshot(user.id, await req.json()), 201);
    if (req.method === 'DELETE' && runId) {
      const deleted = await deleteRun(user.id, runId, organizationId);
      return deleted ? new Response(null, { status: 204 }) : json({ error: 'Field not found' }, 404);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    if (error instanceof OrganizationAuthorizationError) return json({ error: error.message }, 403);
    if (error instanceof ValidationError || error instanceof SyntaxError) {
      return json({ error: error.message }, 400);
    }
    console.error('Field storage request failed', { requestId: context.requestId, error });
    return json({ error: 'Unable to access field data' }, 500);
  }
};

export const config: Config = {
  path: ['/api/fields', '/api/fields/:id'],
  method: ['GET', 'POST', 'DELETE'],
};
