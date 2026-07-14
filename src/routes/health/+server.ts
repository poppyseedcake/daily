import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

export const GET = async () => {
  try {
    const { db } = await import('$lib/server/db');
    db.get(sql`select 1 as ready`);
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unhealthy' }, { status: 503 });
  }
};
