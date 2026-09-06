import { getDatabase } from '@netlify/database';
import type { Config } from '@netlify/functions';

export default async () => {
  const db = getDatabase();
  const expired = await db.sql`
    DELETE FROM field_snapshots
    WHERE snapshot_type = 'autosave' AND expires_at <= NOW()
    RETURNING snapshot_id
  `;
  console.log(`Deleted ${expired.length} expired TubeTally autosaves`);
  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: '@daily',
};
