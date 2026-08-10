-- Stack pivot (self-hosted JWT auth, replacing Clerk): users get a bcrypt password hash,
-- and the external-provider id becomes optional (self-hosted users have no Clerk id).
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ALTER COLUMN "authProviderId" DROP NOT NULL;
