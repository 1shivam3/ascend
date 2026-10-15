import { describe, it, expect } from 'vitest';
import { extractUserName } from '@/lib/supabase/sync';

describe('Google OAuth & User Name Extraction (Option A)', () => {
  it('extracts full_name from user_metadata when provided by Google', () => {
    const user = {
      id: 'usr_1',
      email: 'alex.smith@example.com',
      user_metadata: {
        full_name: 'Alex Smith',
        avatar_url: 'https://lh3.googleusercontent.com/photo.jpg',
      },
    };
    expect(extractUserName(user)).toBe('Alex Smith');
  });

  it('extracts name from user_metadata when full_name is absent', () => {
    const user = {
      id: 'usr_2',
      email: 'marcus@example.com',
      user_metadata: {
        name: 'Marcus Aurelius',
      },
    };
    expect(extractUserName(user)).toBe('Marcus Aurelius');
  });

  it('combines given_name and family_name when provided', () => {
    const user = {
      id: 'usr_3',
      email: 'john.doe@example.com',
      user_metadata: {
        given_name: 'John',
        family_name: 'Doe',
      },
    };
    expect(extractUserName(user)).toBe('John Doe');
  });

  it('uses given_name alone when family_name is absent', () => {
    const user = {
      id: 'usr_4',
      email: 'madonna@example.com',
      user_metadata: {
        given_name: 'Madonna',
      },
    };
    expect(extractUserName(user)).toBe('Madonna');
  });

  it('extracts name from identities[0].identity_data as fallback', () => {
    const user = {
      id: 'usr_5',
      email: 'ronnie@example.com',
      user_metadata: {},
      identities: [
        {
          identity_data: {
            full_name: 'Ronnie Coleman',
          },
        },
      ],
    };
    expect(extractUserName(user)).toBe('Ronnie Coleman');
  });

  it('falls back to formatted email username when metadata contains no names', () => {
    const user = {
      id: 'usr_6',
      email: 'bruce.wayne99@example.com',
      user_metadata: {},
    };
    expect(extractUserName(user)).toBe('Bruce Wayne');

    const simpleUser = {
      id: 'usr_7',
      email: 'arnold@example.com',
      user_metadata: {},
    };
    expect(extractUserName(simpleUser)).toBe('Arnold');
  });

  it('returns undefined safely when no user or email is provided', () => {
    expect(extractUserName(null)).toBeUndefined();
    expect(extractUserName(undefined)).toBeUndefined();
    expect(extractUserName({})).toBeUndefined();
  });
});
