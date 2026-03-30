import type { SessionResult } from '@platformik/module-iam/contracts'

export const createTestSession = (): SessionResult => ({
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
  },
  session: {
    id: 'session-1',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  },
})
