import {
  AuthError,
  MembershipStatus,
  Role,
  TenantType,
  type ThemeConfig,
  ValidationError,
  parseThemeConfig,
} from '@vocaliq/shared';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { signToken } from './jwt';
import { hashPassword, verifyPassword } from './password';

/**
 * Self-hosted email/password auth (replaces Clerk). Registration creates the user, a
 * personal CUSTOMER tenant (their workspace), and an OWNER membership — so a fresh signup
 * can immediately use the product. Login verifies the bcrypt hash and issues our own JWT.
 * All user/tenant/membership writes use the owner client (auth-infra spans tenants).
 */

export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
  workspaceName: z.string().min(1).max(120).optional(),
});
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export interface AuthResult {
  token: string;
  userId: string;
}

export interface MeResult {
  userId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  memberships: { tenantId: string; role: string; status: string }[];
  /** Per-user appearance theme (UX-12); null until the user customises. */
  theme: ThemeConfig | null;
}

function slugify(base: string): string {
  const s = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${s || 'workspace'}-${suffix}`;
}

export class AuthService {
  constructor(private readonly db: PrismaService) {}

  /** Create user + personal tenant + OWNER membership, and return a session token. */
  async register(input: unknown): Promise<AuthResult> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid registration');
    }
    const { email, password, name, workspaceName } = parsed.data;

    const existing = await this.db.admin.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new ValidationError('An account with this email already exists');

    const passwordHash = await hashPassword(password);
    const userId = await this.db.admin.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: name ?? null, passwordHash },
        select: { id: true },
      });
      const tenant = await tx.tenant.create({
        data: {
          type: TenantType.CUSTOMER,
          name: workspaceName ?? `${name ?? email.split('@')[0]}'s Workspace`,
          slug: slugify(workspaceName ?? email.split('@')[0] ?? 'workspace'),
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: Role.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      return user.id;
    });

    return { token: signToken(userId), userId };
  }

  /** Verify credentials and return a session token. */
  async login(input: unknown): Promise<AuthResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Email and password are required');
    const user = await this.db.admin.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, passwordHash: true },
    });
    // Same error whether the user is missing or the password is wrong (no enumeration).
    if (!user?.passwordHash) throw new AuthError('Invalid email or password');
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) throw new AuthError('Invalid email or password');
    return { token: signToken(user.id), userId: user.id };
  }

  /** The authenticated user + their memberships (for the tenant switcher) + their appearance theme. */
  async me(userId: string): Promise<MeResult> {
    const user = await this.db.admin.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, imageUrl: true, theme: true },
    });
    if (!user) throw new AuthError('User not found');
    const memberships = await this.db.admin.membership.findMany({
      where: { userId },
      select: { tenantId: true, role: true, status: true },
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      memberships,
      theme: user.theme == null ? null : parseThemeConfig(user.theme),
    };
  }

  /** Persist the user's appearance theme (UX-12). Validates + normalises before storing. */
  async setTheme(userId: string, raw: unknown): Promise<ThemeConfig> {
    const theme = parseThemeConfig(raw);
    await this.db.admin.user.update({
      where: { id: userId },
      data: { theme },
    });
    return theme;
  }
}
