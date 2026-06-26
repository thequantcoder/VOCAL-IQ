/**
 * Clerk → local User sync.
 *
 * The pure mapper below is final; the actual DB persistence is intentionally
 * DEFERRED to Day 4, when the Prisma `User` model + RLS exist (the data model is
 * built then — see DATA-MODEL.md / build order). Today we fully verify the webhook
 * signature and shape the upsert; `syncUser` is a thin seam that Day 4 fills in.
 */

/** The subset of a Clerk user we persist (DATA-MODEL User: authProviderId, email, name). */
export interface UserUpsert {
  authProviderId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

/** Shape of `data` on Clerk `user.created` / `user.updated` webhook events. */
export interface ClerkUserData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

/** Map a Clerk user payload to our upsert shape. Pure + deterministic (idempotent). */
export function mapClerkUserToUpsert(data: ClerkUserData): UserUpsert {
  const primary =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses?.[0];
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return {
    authProviderId: data.id,
    email: primary?.email_address ?? null,
    name: name.length > 0 ? name : null,
    imageUrl: data.image_url ?? null,
  };
}

/**
 * Persist (upsert) a synced user. DEFERRED: Day 4 wires the Prisma upsert
 * keyed on `authProviderId` (idempotent). Until then this is a no-op that returns
 * the computed shape so callers + tests are ready.
 */
export async function syncUser(data: ClerkUserData): Promise<UserUpsert> {
  const upsert = mapClerkUserToUpsert(data);
  // TODO(Day 4): await db.user.upsert({ where: { authProviderId }, create/update })
  return upsert;
}
