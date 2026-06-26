import { z } from 'zod';

export const todoUrgencySchema = z.enum(['low', 'medium', 'high']);

export const todoTaskTitleSchema = z.string().trim().min(1).max(120);
export const todoCategoryNameSchema = z.string().trim().min(1).max(80);

export const createTodoTaskSchema = z.object({
  title: todoTaskTitleSchema,
  categoryId: z.string().nullable(),
  urgency: todoUrgencySchema
});

export const updateTodoTaskSchema = z.object({
  id: z.string(),
  title: todoTaskTitleSchema,
  urgency: todoUrgencySchema
});

export const todoCategoryMutationSchema = z.object({
  name: todoCategoryNameSchema
});

export type TodoUrgency = z.infer<typeof todoUrgencySchema>;
export type TodoTask = {
  id: string;
  title: string;
  categoryId: string | null;
  urgency: TodoUrgency;
};
export type TodoCategory = {
  id: string;
  name: string;
};

