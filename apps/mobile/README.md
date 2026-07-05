# VocalIQ Mobile (Day 65)

A standalone **Expo / React Native** app to manage agents, monitor live calls, take **Agent Desk**
transfers, and receive push notifications on the go. It is intentionally **excluded from the
monorepo pnpm workspace** (`pnpm-workspace.yaml`) so its React Native toolchain doesn't affect the
web/api build or CI.

## Why it's safe by construction
- **Same auth + tenancy contract as web:** `lib/api.ts` sends the self-hosted JWT + `x-tenant-id`
  header exactly like `apps/web`, so tenant scoping + RBAC are enforced server-side identically —
  the mobile client gains no privileged path (self-audit B/C).
- **Secrets in the secure enclave:** the session token is stored via `expo-secure-store`
  (Keychain/Keystore), never in plain storage.

## Develop
```bash
cd apps/mobile
npm install        # its own lockfile — NOT the monorepo's
npm run ios        # or: npm run android / npm start
```

## Scope (this scaffold)
- ✅ API client with secure token storage + core calls (login, agents, live calls).
- ✅ Home screen (agents + live-call count).
- ▢ Full Agent Desk transfer UI, push-notification registration, and agent editing — built out on
  this foundation (they reuse the existing `/agents`, `/analytics`, and Agent Desk endpoints).
