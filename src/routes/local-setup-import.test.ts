import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';
import { createDefaultTodoState } from '$lib/todo';
import { localSetupVersion } from '$lib/localSetup';

const { getSession, importVisitorLocalSetupForUser } = vi.hoisted(() => ({
  getSession: vi.fn(),
  importVisitorLocalSetupForUser: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/localSetupImport', () => ({
  importVisitorLocalSetupForUser
}));

const { PUT } = await import('./local-setup-import/+server');

const validLocalSetup = () => ({
  version: localSetupVersion,
  summaryConfiguration: {
    ...defaultSummaryConfiguration,
    summaryTime: '18:45',
    userTimeZone: 'Europe/Warsaw' as const,
    summaryTheme: 'dark' as const,
    sections: {
      weather: false,
      commute: true,
      calendar: true,
      todo: true
    }
  },
  todoCategories: [
    {
      id: 'visitor-category-work',
      name: 'Work',
      position: 1
    }
  ],
  todoTasks: [
    {
      id: 'visitor-task-uncategorized',
      title: 'Pack lunch',
      categoryId: null,
      urgency: 'medium' as const,
      position: 1,
      completed: false
    },
    {
      id: 'visitor-task-work',
      title: 'Send update',
      categoryId: 'visitor-category-work',
      urgency: 'high' as const,
      position: 1,
      completed: false
    }
  ],
  nextTodoId: 10
});

const putLocalSetup = (payload: unknown) =>
  PUT({
    request: new Request('http://localhost/local-setup-import', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } as Parameters<typeof PUT>[0]);

describe('Local Setup import route', () => {
  beforeEach(() => {
    getSession.mockReset();
    importVisitorLocalSetupForUser.mockReset();
  });

  test('imports a valid Visitor Local Setup for the signed-in User', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    importVisitorLocalSetupForUser.mockResolvedValue({ outcome: 'imported' });

    const response = await putLocalSetup(validLocalSetup());

    await expect(response.json()).resolves.toEqual({ outcome: 'imported' });
    expect(response.status).toBe(200);
    expect(importVisitorLocalSetupForUser).toHaveBeenCalledWith('user-1', validLocalSetup());
  });

  test('does not import when the request is not a signed-in User', async () => {
    getSession.mockResolvedValue(null);

    const response = await putLocalSetup(validLocalSetup());

    await expect(response.json()).resolves.toEqual({ outcome: 'unauthorized' });
    expect(response.status).toBe(401);
    expect(importVisitorLocalSetupForUser).not.toHaveBeenCalled();
  });

  test('reports invalid Local Setup without importing partial User setup', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });
    importVisitorLocalSetupForUser.mockResolvedValue({ outcome: 'invalid-local-setup' });

    const response = await putLocalSetup({
      ...validLocalSetup(),
      todoTasks: [{ ...validLocalSetup().todoTasks[0], title: '' }]
    });

    await expect(response.json()).resolves.toEqual({ outcome: 'invalid-local-setup' });
    expect(response.status).toBe(400);
  });
});
