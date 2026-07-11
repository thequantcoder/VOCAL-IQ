-- UX-12 — per-user appearance theme. A nullable JSONB column on User holding the validated
-- ThemeConfig (preset + custom primary/secondary/accent + radius/density/motion/font). Nullable so
-- existing users default to the platform theme until they customise. Not tenant-scoped (it's a user
-- preference, not tenant data) → no RLS policy.
ALTER TABLE "User" ADD COLUMN "theme" JSONB;
