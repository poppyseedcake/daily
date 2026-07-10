import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { googleCalendarReadScope, parseGoogleProviderScopes } from '$lib/googleCalendarScopes';
import type { SavedSelectedCalendar } from '$lib/selectedCalendars';
import { db } from '$lib/server/db';
import { authAccount, calendarConnections, selectedCalendars, users } from './schema';

export type ConnectedCalendarConnection = {
  status: 'connected';
  providerAccountId: string;
  grantedScopes: string[];
  accessTokenAvailable: boolean;
  refreshTokenAvailable: boolean;
  accessTokenExpiresAt: Date | null;
};

export type CalendarConnection =
  | ConnectedCalendarConnection
  | { status: 'not-connected' }
  | { status: 'failed' };

export type SaveConnectedCalendarConnection = Omit<ConnectedCalendarConnection, 'status'>;

export type UserCalendarConnectionStore = {
  load: (userId: string) => Promise<CalendarConnection>;
  saveConnected: (userId: string, connection: SaveConnectedCalendarConnection) => Promise<void>;
  saveConnectedFromGoogleAuthAccount: (userId: string) => Promise<boolean>;
  markFailed: (userId: string) => Promise<void>;
  disconnect: (userId: string) => Promise<void>;
  saveSelectedCalendars: (userId: string, calendars: SavedSelectedCalendar[]) => Promise<void>;
  loadSelectedCalendarIds: (userId: string) => Promise<string[]>;
  loadSelectedCalendars: (userId: string) => Promise<SavedSelectedCalendar[]>;
};

type CalendarConnectionDatabase = typeof db;

const parseGrantedScopes = (value: string): string[] => {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === 'string') : [];
};

export const createUserCalendarConnectionStore = (
  database: CalendarConnectionDatabase
): UserCalendarConnectionStore => ({
  async load(userId) {
    const row = await database.query.calendarConnections.findFirst({
      where: eq(calendarConnections.userId, userId)
    });

    if (!row) {
      return { status: 'not-connected' };
    }

    if (row.connectionStatus === 'failed') {
      return { status: 'failed' };
    }

    return {
      status: 'connected',
      providerAccountId: row.providerAccountId ?? '',
      grantedScopes: parseGrantedScopes(row.grantedScopes),
      accessTokenAvailable: row.accessTokenAvailable,
      refreshTokenAvailable: row.refreshTokenAvailable,
      accessTokenExpiresAt: row.accessTokenExpiresAt
    };
  },
  async saveConnected(userId, connection) {
    await database
      .insert(calendarConnections)
      .values({
        id: randomUUID(),
        userId,
        connectionStatus: 'connected',
        providerAccountId: connection.providerAccountId,
        grantedScopes: JSON.stringify(connection.grantedScopes),
        accessTokenAvailable: connection.accessTokenAvailable,
        refreshTokenAvailable: connection.refreshTokenAvailable,
        accessTokenExpiresAt: connection.accessTokenExpiresAt,
        updatedAt: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: calendarConnections.userId,
        set: {
          connectionStatus: 'connected',
          providerAccountId: connection.providerAccountId,
          grantedScopes: JSON.stringify(connection.grantedScopes),
          accessTokenAvailable: connection.accessTokenAvailable,
          refreshTokenAvailable: connection.refreshTokenAvailable,
          accessTokenExpiresAt: connection.accessTokenExpiresAt,
          updatedAt: new Date().toISOString()
        }
      });
  },
  async saveConnectedFromGoogleAuthAccount(authUserId) {
    const rows = await database.query.authAccount.findMany({
      where: and(eq(authAccount.user_id, authUserId), eq(authAccount.provider_id, 'google')),
      orderBy: desc(authAccount.updated_at)
    });
    const scopedAccount = rows
      .map((row) => ({
        row,
        grantedScopes: parseGoogleProviderScopes(row.scope)
      }))
      .find((account) => account.grantedScopes.includes(googleCalendarReadScope));

    if (!scopedAccount) {
      return false;
    }

    const dailyUser = await database.query.users.findFirst({
      where: eq(users.googleSubject, scopedAccount.row.account_id)
    });

    if (!dailyUser) {
      return false;
    }

    await this.saveConnected(dailyUser.id, {
      providerAccountId: scopedAccount.row.account_id,
      grantedScopes: scopedAccount.grantedScopes,
      accessTokenAvailable: Boolean(scopedAccount.row.access_token),
      refreshTokenAvailable: Boolean(scopedAccount.row.refresh_token),
      accessTokenExpiresAt: scopedAccount.row.access_token_expires_at
    });

    return true;
  },
  async markFailed(userId) {
    await database
      .insert(calendarConnections)
      .values({
        id: randomUUID(),
        userId,
        connectionStatus: 'failed',
        grantedScopes: '[]',
        updatedAt: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: calendarConnections.userId,
        set: {
          connectionStatus: 'failed',
          providerAccountId: null,
          grantedScopes: '[]',
          accessTokenAvailable: false,
          refreshTokenAvailable: false,
          accessTokenExpiresAt: null,
          updatedAt: new Date().toISOString()
        }
      });
  },
  async disconnect(userId) {
    await database.delete(calendarConnections).where(eq(calendarConnections.userId, userId));
    await database.delete(selectedCalendars).where(eq(selectedCalendars.userId, userId));
  },
  async saveSelectedCalendars(userId, calendars) {
    database.transaction((transaction) => {
      transaction.delete(selectedCalendars).where(eq(selectedCalendars.userId, userId)).run();
      for (const [position, calendar] of calendars.entries()) {
        transaction
          .insert(selectedCalendars)
          .values({
            id: randomUUID(),
            userId,
            calendarId: calendar.id,
            summary: calendar.summary,
            backgroundColor: calendar.backgroundColor,
            primary: calendar.primary,
            position
          })
          .run();
      }
    });
  },
  async loadSelectedCalendarIds(userId) {
    const rows = await database.query.selectedCalendars.findMany({
      where: eq(selectedCalendars.userId, userId),
      orderBy: asc(selectedCalendars.position)
    });

    return rows.map((row) => row.calendarId);
  },
  async loadSelectedCalendars(userId) {
    const rows = await database.query.selectedCalendars.findMany({
      where: eq(selectedCalendars.userId, userId),
      orderBy: asc(selectedCalendars.position)
    });

    return rows.map((row) => ({
      id: row.calendarId,
      summary: row.summary,
      backgroundColor: row.backgroundColor,
      primary: row.primary
    }));
  }
});

export const userCalendarConnectionStore = createUserCalendarConnectionStore(db);
