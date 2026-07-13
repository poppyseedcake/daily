import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { Temporal } from '@js-temporal/polyfill';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { dailyUserIdentityStore } from '$lib/server/db/dailyUserIdentityStore';
import {
  persistDailyUserIdentity,
  type DailyUserIdentityOutcome
} from '$lib/server/db/dailyUserIdentity';
import { authAccount, authSession, authUser, authVerification } from '$lib/server/db/schema';
export { googleCalendarReadScope, googleCalendarReadScopes } from '$lib/googleCalendarScopes';

export const googleIdentityScopes = ['openid', 'email', 'profile'] as const;

type GoogleProviderEnvironment = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export const googleProviderOptions = (environment: GoogleProviderEnvironment) => ({
  clientId: environment.GOOGLE_CLIENT_ID ?? 'missing-google-client-id',
  clientSecret: environment.GOOGLE_CLIENT_SECRET ?? 'missing-google-client-secret',
  scopes: [...googleIdentityScopes]
});

export const requireStoredDailyUserIdentity = (outcome: DailyUserIdentityOutcome) => {
  if (outcome !== 'stored') {
    throw new Error(`Failed to persist Daily user identity: ${outcome}`);
  }
};

export const authOptions = {
  appName: 'Daily',
  secret: env.BETTER_AUTH_SECRET ?? (building || dev ? 'daily-local-build-placeholder-secret' : undefined),
  baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5174',
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification
    }
  }),
  user: {
    modelName: 'user',
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  session: {
    modelName: 'session',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id'
    },
    storeSessionInDatabase: true
  },
  account: {
    modelName: 'account',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  verification: {
    modelName: 'verification',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  socialProviders: {
    google: googleProviderOptions(env)
  },
  databaseHooks: {
    account: {
      create: {
        async after(account) {
          if (account.providerId !== 'google') {
            return;
          }

          const [user] = await db
            .select({ email: authUser.email })
            .from(authUser)
            .where(eq(authUser.id, account.userId))
            .limit(1);

          if (!user?.email) {
            throw new Error('Failed to persist Daily user identity: missing-auth-user-email');
          }

          const result = await persistDailyUserIdentity(
            dailyUserIdentityStore,
            {
              id: account.userId,
              googleSubject: account.accountId,
              email: user.email
            },
            Temporal.Now.instant()
          );

          requireStoredDailyUserIdentity(result.outcome);
        }
      }
    }
  }
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
