import { relations, sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
      .default(sql`CURRENT_TIMESTAMP`)
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

export const usersRelations = relations(users, ({ one, many }) => ({
  summaryConfiguration: one(summaryConfigurations),
  todoCategories: many(todoCategories),
  todoTasks: many(todoTasks)
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
