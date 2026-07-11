import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AuthService } from './auth.service';

/**
 * Auth service theme persistence (UX-12) against real Postgres. Proves the per-user theme round-trips
 * through `setTheme` → `me`, that invalid input is normalised to a valid config (never stored raw), and
 * that a fresh user has a null theme (defaults to the platform look).
 */

const db = new PrismaService();
const svc = new AuthService(db);
const userIds: string[] = [];

// Create the user directly (no register/token — keeps the test independent of APP_JWT_SECRET).
async function makeUser(): Promise<string> {
  const email = `theme-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const user = await db.admin.user.create({
    data: { email, name: 'Theme Tester' },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  await db.admin.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('AuthService theme (UX-12)', () => {
  it('a fresh user has no theme (platform default)', async () => {
    const userId = await makeUser();
    const me = await svc.me(userId);
    expect(me.theme).toBeNull();
  });

  it('persists + round-trips a valid theme through me()', async () => {
    const userId = await makeUser();
    const saved = await svc.setTheme(userId, {
      preset: 'ocean',
      radius: 'round',
      density: 'compact',
      colors: { primary: '#3b82f6' },
    });
    expect(saved.preset).toBe('ocean');
    expect(saved.colors.primary).toBe('#3b82f6');

    const me = await svc.me(userId);
    expect(me.theme?.preset).toBe('ocean');
    expect(me.theme?.radius).toBe('round');
    expect(me.theme?.density).toBe('compact');
    expect(me.theme?.colors.primary).toBe('#3b82f6');
  });

  it('normalises invalid input instead of storing it raw', async () => {
    const userId = await makeUser();
    const saved = await svc.setTheme(userId, {
      preset: 'not-a-preset',
      colors: { primary: 'red' },
    });
    // Bad preset + bad hex fall back to defaults; never persisted as-is.
    expect(saved.preset).toBe('nebula');
    expect(saved.colors.primary).toBeUndefined();
  });
});
