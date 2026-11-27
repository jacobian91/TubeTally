import { getDatabase } from '@netlify/database';
import { admin, getIdentityConfig, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config, Context } from '@netlify/functions';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function validateEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

async function findExistingUser(email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const users = await admin.listUsers({ page, perPage: 100 });
    if (users.some(user => user.email?.toLowerCase() === email)) return true;
    if (users.length < 100) return false;
  }
  throw new Error('Identity account lookup exceeded the supported page limit.');
}

export default async (req: Request, context: Context) => {
  const user = await getUser();
  if (!user?.id) return json({ error: 'Sign in to invite someone.' }, 401);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    verifyRequestOrigin(req);
    const email = validateEmail((await req.json()).email);
    if (!email) return json({ error: 'Enter a valid email address.' }, 400);
    if (email === user.email?.toLowerCase()) return json({ error: 'You already have an account.' }, 400);
    const config = getIdentityConfig();
    if (!config?.url || !config.token) throw new Error('Identity invites are not configured.');
    const client = await getDatabase().pool.connect();
    try {
      // Serialize invite attempts for a sender to prevent concurrent requests bypassing limits.
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.id]);
      await client.query(`DELETE FROM account_invitation_attempts
        WHERE created_at < NOW() - INTERVAL '30 days'`);
      const limits = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE invited_by_identity_user_id = $1 AND created_at > NOW() - INTERVAL '24 hours')::integer AS daily,
          COUNT(*) FILTER (WHERE normalized_email = $2 AND created_at > NOW() - INTERVAL '24 hours')::integer AS recipient
         FROM account_invitation_attempts`, [user.id, email]);
      if (limits.rows[0].daily >= 10 || limits.rows[0].recipient >= 2) {
        await client.query('ROLLBACK');
        return json({ error: 'Invitation limit reached. Try again tomorrow.' }, 429);
      }
      await client.query(
        `INSERT INTO account_invitation_attempts (id, invited_by_identity_user_id, normalized_email)
         VALUES ($1, $2, $3)`, [crypto.randomUUID(), user.id, email]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (await findExistingUser(email)) return json({ error: 'This person already has a Tube Tally account.' }, 409);
    const response = await fetch(`${config.url}/invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      console.warn('Identity invitation delivery failed', { requestId: context.requestId, status: response.status });
      return json({ error: 'Unable to send invitation right now.' }, 502);
    }
    return json({ invited: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body.' }, 400);
    console.error('Account invitation error', { requestId: context.requestId, error });
    return json({ error: 'Unable to send invitation.' }, 500);
  }
};

export const config: Config = {
  path: '/api/account-invitations',
  method: ['POST'],
};
