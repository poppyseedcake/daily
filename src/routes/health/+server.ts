import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

export const GET = async () => {
  try {
    const { db } = await import('$lib/server/db');
    db.get(sql`select id from scheduled_worker_runs limit 1`);
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unhealthy' }, { status: 503 });
  }
};
