import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, savedTodoStates } = vi.hoisted(() => ({
  getSession: vi.fn(),
  savedTodoStates: [] as Array<{ userId: string; todoState: unknown }>
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/todoStore', () => ({
  userTodoStore: {
    async load() {
      return null;
    },
    async save(userId: string, todoState: unknown) {
      savedTodoStates.push({ userId, todoState });
    }
  }
}));

const { PUT } = await import('./todo-state/+server');

const putTodoStateBody = (body: BodyInit) =>
  PUT({
    request: new Request('http://localhost/todo-state', {
      method: 'PUT',
      body
    })
  } as Parameters<typeof PUT>[0]);

const putTodoState = (body: unknown) => putTodoStateBody(JSON.stringify(body));

describe('Todo state endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    savedTodoStates.length = 0;
  });

  test('rejects Visitor updates before writing', async () => {
    getSession.mockResolvedValue(null);

    const response = await putTodoState({
      todoCategories: [],
      todoTasks: [],
      nextTodoId: 1
    });

    expect(response.status).toBe(401);
    expect(savedTodoStates).toEqual([]);
  });

  test('rejects malformed or invalid Todo state before writing', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const malformedResponse = await putTodoStateBody('{');
    const invalidResponse = await putTodoState({
      todoCategories: [],
      todoTasks: [],
      nextTodoId: 0
    });

    expect(malformedResponse.status).toBe(400);
    expect(invalidResponse.status).toBe(400);
    expect(savedTodoStates).toEqual([]);
  });

  test('saves valid Todo state for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const todoState = {
      todoCategories: [{ id: 'category-work', name: 'Work', position: 1 }],
      todoTasks: [
        {
          id: 'todo-work',
          title: 'Draft update',
          categoryId: 'category-work',
          urgency: 'medium',
          position: 1,
          completed: false
        }
      ],
      nextTodoId: 2
    };

    const response = await putTodoState(todoState);

    expect(response.status).toBe(200);
    expect(savedTodoStates).toEqual([{ userId: 'user-1', todoState }]);
  });
});
