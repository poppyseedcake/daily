import Database from 'better-sqlite3';
import { makeSignature } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const createDemoUser = async ({ databaseURL, applicationURL, authSecret }) => {
  if (!databaseURL?.startsWith(join(tmpdir(), 'daily-playwright-'))) {
    throw new Error('Recording requires an isolated daily-playwright-* database in the temporary directory.');
  }
  if (!authSecret) throw new Error('Set DAILY_DOCS_AUTH_SECRET to the local server test secret.');
  const database = new Database(databaseURL);
  database.pragma('foreign_keys = ON');
  const userId = `daily-demo-${randomUUID()}`;
  const email = `${userId}@example.com`;
  const googleSubject = `demo-google-${userId}`;
  const token = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const calendarScopes = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'];
  database.transaction(() => {
    database.prepare('insert into auth_user values (?, ?, ?, true, null, ?, ?)').run(userId, 'Alex', email, now, now);
    database.prepare('insert into auth_session values (?, ?, ?, ?, ?, null, null, ?)').run(randomUUID(), now + 3600, token, now, now, userId);
    database.prepare(`insert into auth_account (id, account_id, provider_id, user_id, access_token, access_token_expires_at, scope, created_at, updated_at)
      values (?, ?, 'google', ?, 'fixture-access-token', ?, ?, ?, ?)`).run(randomUUID(), googleSubject, userId, now + 3600, `openid email profile ${calendarScopes.join(' ')}`, now, now);
    database.prepare('insert into users (id, google_subject, email, terms_version, terms_accepted_at) values (?, ?, ?, ?, ?)')
      .run(userId, googleSubject, email, '2026-09-21', '2026-09-21T00:00:00.000Z');
    database.prepare('insert into summary_configurations (id, user_id, summary_time, user_time_zone) values (?, ?, ?, ?)')
      .run(randomUUID(), userId, '07:00', 'UTC');
    database.prepare(`insert into calendar_connections (id, user_id, connection_status, provider_account_id, granted_scopes,
      access_token_available, refresh_token_available, access_token_expires_at, updated_at)
      values (?, ?, 'connected', ?, ?, true, false, ?, ?)`).run(randomUUID(), userId, googleSubject, JSON.stringify(calendarScopes), now + 3600, new Date().toISOString());
    database.prepare('insert into selected_calendars (id, user_id, calendar_id, position, summary, background_color, `primary`) values (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, 'primary', 0, 'Personal', '#3f51b5', 1);
  })();
  return {
    cookie: { name: 'better-auth.session_token', value: `${token}.${await makeSignature(token, authSecret)}`, domain: new URL(applicationURL).hostname, path: '/' },
    verify: () => {
      const task = database.prepare('select title from todo_tasks where user_id = ?').all(userId);
      const routes = database.prepare('select name from commute_routes where user_id = ?').all(userId);
      const location = database.prepare('select label from weather_locations where user_id = ?').get(userId);
      const configuration = database.prepare('select summary_time, user_time_zone from summary_configurations where user_id = ?').get(userId);
      const calendars = database.prepare('select calendar_id from selected_calendars where user_id = ?').all(userId);
      if (!task.some(item => item.title === 'Prepare the project proposal') || !routes.some(item => item.name === 'Office') ||
          location?.label !== 'Warsaw, Poland' || configuration?.summary_time !== '08:05' ||
          configuration?.user_time_zone !== 'Europe/Warsaw' || !calendars.some(calendar => calendar.calendar_id === 'work')) {
        throw new Error('The recorded task, route, calendar, city, delivery time, or time zone was not saved.');
      }
    },
    cleanup: () => {
      database.prepare('delete from users where id = ?').run(userId);
      database.prepare('delete from auth_user where id = ?').run(userId);
      database.close();
    }
  };
};
