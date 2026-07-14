import { relations, sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { deliveryErrorClassifications } from '$lib/deliveryRecords';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    googleSubject: text('google_subject').notNull(),
    email: text('email').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    nextSummaryAt: text('next_summary_at')
  },
  (table) => ({
    googleSubjectIdx: uniqueIndex('users_google_subject_idx').on(table.googleSubject),
    emailIdx: uniqueIndex('users_email_idx').on(table.email)
  })
);

export const summaryConfigurations = sqliteTable('summary_configurations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  summaryTime: text('summary_time').notNull().default('07:00'),
  userTimeZone: text('user_time_zone').notNull().default('UTC'),
  summaryTheme: text('summary_theme', { enum: ['light', 'dark'] }).notNull().default('light'),
  summaryDeliveryEnabled: integer('summary_delivery_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  weatherSectionEnabled: integer('weather_section_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  commuteSectionEnabled: integer('commute_section_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  calendarSectionEnabled: integer('calendar_section_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  todoSectionEnabled: integer('todo_section_enabled', { mode: 'boolean' }).notNull().default(true)
});

export const todoCategories = sqliteTable('todo_categories', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull()
});

export const todoTasks = sqliteTable('todo_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => todoCategories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  urgency: text('urgency', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  position: integer('position').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false)
});

export const weatherLocations = sqliteTable('weather_locations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  label: text('label').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull()
});

export const commuteRoutes = sqliteTable(
  'commute_routes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    originLabel: text('origin_label').notNull(),
    originLatitude: real('origin_latitude').notNull(),
    originLongitude: real('origin_longitude').notNull(),
    destinationLabel: text('destination_label').notNull(),
    destinationLatitude: real('destination_latitude').notNull(),
    destinationLongitude: real('destination_longitude').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull()
  },
  (table) => ({
    userPositionIdx: uniqueIndex('commute_routes_user_position_idx').on(table.userId, table.position)
  })
);

export const commuteDays = sqliteTable(
  'commute_days',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: text('day', {
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }).notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })]
);

export const calendarConnections = sqliteTable('calendar_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  connectionStatus: text('connection_status', {
    enum: ['connected', 'failed']
  }).notNull(),
  providerAccountId: text('provider_account_id'),
  grantedScopes: text('granted_scopes').notNull().default('[]'),
  accessTokenAvailable: integer('access_token_available', { mode: 'boolean' })
    .notNull()
    .default(false),
  refreshTokenAvailable: integer('refresh_token_available', { mode: 'boolean' })
    .notNull()
    .default(false),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const selectedCalendars = sqliteTable(
  'selected_calendars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarId: text('calendar_id').notNull(),
    summary: text('summary').notNull().default(''),
    backgroundColor: text('background_color'),
    primary: integer('primary', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull()
  },
  (table) => ({
    userCalendarIdx: uniqueIndex('selected_calendars_user_calendar_idx').on(
      table.userId,
      table.calendarId
    )
  })
);

export const deliveryRecords = sqliteTable(
  'delivery_records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptType: text('attempt_type', { enum: ['test', 'scheduled'] }).notNull(),
    requestedAt: text('requested_at').notNull(),
    completedAt: text('completed_at'),
    deliveryStatus: text('delivery_status', {
      enum: ['processing', 'retrying', 'sent', 'failed']
    }).notNull(),
    providerName: text('provider_name').notNull(),
    providerMessageId: text('provider_message_id'),
    providerStatusMetadata: text('provider_status_metadata'),
    errorClassification: text('error_classification', { enum: deliveryErrorClassifications }),
    scheduledAt: text('scheduled_at'),
    attemptCount: integer('attempt_count'),
    lastAttemptAt: text('last_attempt_at'),
    nextRetryAt: text('next_retry_at'),
    claimExpiresAt: text('claim_expires_at')
  },
  (table) => ({
    userRequestedAtIdx: index('delivery_records_user_requested_at_idx').on(
      table.userId,
      table.requestedAt
    ),
    scheduledOccurrenceIdx: uniqueIndex('delivery_records_scheduled_occurrence_idx').on(
      table.userId,
      table.scheduledAt
    )
  })
);

export const googleMapsUsage = sqliteTable(
  'google_maps_usage',
  {
    periodKind: text('period_kind', { enum: ['day', 'month'] }).notNull(),
    periodStartUtc: text('period_start_utc').notNull(),
    category: text('category', {
      enum: ['map-point-selection', 'commute-estimate']
    }).notNull(),
    requestCount: integer('request_count').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.periodKind, table.periodStartUtc, table.category] }),
    check(
      'google_maps_usage_period_kind_check',
      sql`${table.periodKind} IN ('day', 'month')`
    ),
    check(
      'google_maps_usage_category_check',
      sql`${table.category} IN ('map-point-selection', 'commute-estimate')`
    ),
    check('google_maps_usage_request_count_check', sql`${table.requestCount} >= 0`)
  ]
);

export const googleMapsPersonUsage = sqliteTable(
  'google_maps_person_usage',
  {
    periodStartUtc: text('period_start_utc').notNull(),
    personUsageIdentity: text('person_usage_identity').notNull(),
    requestCount: integer('request_count').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.periodStartUtc, table.personUsageIdentity] }),
    check('google_maps_person_usage_request_count_check', sql`${table.requestCount} >= 0`)
  ]
);

export const googleMapsControl = sqliteTable(
  'google_maps_control',
  {
    controlKey: text('control_key').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [
    check('google_maps_control_key_check', sql`${table.controlKey} = 'admin-kill-switch'`),
    check('google_maps_control_enabled_check', sql`${table.enabled} IN (0, 1)`)
  ]
);

export const googleMapsCapAlerts = sqliteTable(
  'google_maps_cap_alerts',
  {
    capType: text('cap_type', { enum: ['daily', 'monthly'] }).notNull(),
    periodStartUtc: text('period_start_utc').notNull(),
    deliveryStatus: text('delivery_status', {
      enum: ['pending', 'delivered', 'failed']
    }).notNull(),
    claimedAt: text('claimed_at').notNull(),
    completedAt: text('completed_at'),
    failureCode: text('failure_code')
  },
  (table) => [
    primaryKey({ columns: [table.capType, table.periodStartUtc] }),
    check('google_maps_cap_alerts_cap_type_check', sql`${table.capType} IN ('daily', 'monthly')`),
    check(
      'google_maps_cap_alerts_delivery_status_check',
      sql`${table.deliveryStatus} IN ('pending', 'delivered', 'failed')`
    )
  ]
);

export const authUser = sqliteTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    email_verified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp' }).notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex('auth_user_email_idx').on(table.email)
  })
);

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull(),
    created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    user_id: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' })
  },
  (table) => ({
    tokenIdx: uniqueIndex('auth_session_token_idx').on(table.token)
  })
);

export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  account_id: text('account_id').notNull(),
  provider_id: text('provider_id').notNull(),
  user_id: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  access_token: text('access_token'),
  refresh_token: text('refresh_token'),
  id_token: text('id_token'),
  access_token_expires_at: integer('access_token_expires_at', { mode: 'timestamp' }),
  refresh_token_expires_at: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const usersRelations = relations(users, ({ one, many }) => ({
  summaryConfiguration: one(summaryConfigurations),
  todoCategories: many(todoCategories),
  todoTasks: many(todoTasks),
  weatherLocation: one(weatherLocations),
  commuteRoutes: many(commuteRoutes),
  commuteDays: many(commuteDays),
  calendarConnection: one(calendarConnections),
  selectedCalendars: many(selectedCalendars),
  deliveryRecords: many(deliveryRecords)
}));

export const summaryConfigurationsRelations = relations(summaryConfigurations, ({ one }) => ({
  user: one(users, {
    fields: [summaryConfigurations.userId],
    references: [users.id]
  })
}));

export const todoCategoriesRelations = relations(todoCategories, ({ one, many }) => ({
  user: one(users, {
    fields: [todoCategories.userId],
    references: [users.id]
  }),
  todoTasks: many(todoTasks)
}));

export const todoTasksRelations = relations(todoTasks, ({ one }) => ({
  user: one(users, {
    fields: [todoTasks.userId],
    references: [users.id]
  }),
  category: one(todoCategories, {
    fields: [todoTasks.categoryId],
    references: [todoCategories.id]
  })
}));

export const weatherLocationsRelations = relations(weatherLocations, ({ one }) => ({
  user: one(users, {
    fields: [weatherLocations.userId],
    references: [users.id]
  })
}));

export const commuteRoutesRelations = relations(commuteRoutes, ({ one }) => ({
  user: one(users, {
    fields: [commuteRoutes.userId],
    references: [users.id]
  })
}));

export const commuteDaysRelations = relations(commuteDays, ({ one }) => ({
  user: one(users, {
    fields: [commuteDays.userId],
    references: [users.id]
  })
}));

export const calendarConnectionsRelations = relations(calendarConnections, ({ one }) => ({
  user: one(users, {
    fields: [calendarConnections.userId],
    references: [users.id]
  })
}));

export const selectedCalendarsRelations = relations(selectedCalendars, ({ one }) => ({
  user: one(users, {
    fields: [selectedCalendars.userId],
    references: [users.id]
  })
}));

export const deliveryRecordsRelations = relations(deliveryRecords, ({ one }) => ({
  user: one(users, {
    fields: [deliveryRecords.userId],
    references: [users.id]
  })
}));
