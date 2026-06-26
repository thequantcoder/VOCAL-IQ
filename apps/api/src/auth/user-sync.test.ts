import { describe, expect, it } from 'vitest';
import { type ClerkUserData, mapClerkUserToUpsert } from './user-sync';

const base: ClerkUserData = {
  id: 'user_abc',
  email_addresses: [
    { id: 'idp_1', email_address: 'old@x.com' },
    { id: 'idp_2', email_address: 'primary@x.com' },
  ],
  primary_email_address_id: 'idp_2',
  first_name: 'Ada',
  last_name: 'Lovelace',
  image_url: 'https://img/x.png',
};

describe('mapClerkUserToUpsert', () => {
  it('selects the primary email and joins the name', () => {
    expect(mapClerkUserToUpsert(base)).toEqual({
      authProviderId: 'user_abc',
      email: 'primary@x.com',
      name: 'Ada Lovelace',
      imageUrl: 'https://img/x.png',
    });
  });

  it('is idempotent — same input maps to an equal result', () => {
    expect(mapClerkUserToUpsert(base)).toEqual(mapClerkUserToUpsert(base));
  });

  it('falls back to the first email and null name when fields are missing', () => {
    const result = mapClerkUserToUpsert({
      id: 'user_x',
      email_addresses: [{ id: 'idp_1', email_address: 'only@x.com' }],
    });
    expect(result).toEqual({
      authProviderId: 'user_x',
      email: 'only@x.com',
      name: null,
      imageUrl: null,
    });
  });

  it('handles a user with no email at all', () => {
    expect(mapClerkUserToUpsert({ id: 'u' }).email).toBeNull();
  });
});
