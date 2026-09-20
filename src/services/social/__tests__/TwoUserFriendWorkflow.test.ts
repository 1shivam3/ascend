import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriendService } from '../FriendService';

// Mock sqlite database in-memory emulation for precise multi-step interaction testing
const { mockDb, tables } = vi.hoisted(() => {
  const state = {
    profiles: [] as any[],
    friendships: [] as any[],
    friend_requests: [] as any[],
    blocks: [] as any[],
    privacy_settings: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO friend_requests') || s.startsWith('INSERT OR IGNORE INTO friend_requests')) {
        const [id, sender_id, receiver_id, created_at, updated_at] = params;
        state.friend_requests.push({ id, sender_id, receiver_id, status: 'PENDING', created_at, updated_at: updated_at || created_at });
        return { changes: 1 };
      }
      if (s.startsWith('INSERT INTO friendships') || s.startsWith('INSERT OR IGNORE INTO friendships')) {
        const [id, user_id, friend_id, created_at] = params;
        // Avoid duplicates
        if (!state.friendships.some(f => f.user_id === user_id && f.friend_id === friend_id)) {
          state.friendships.push({ id, user_id, friend_id, created_at });
        }
        return { changes: 1 };
      }
      if (s.startsWith('INSERT INTO blocks') || s.startsWith('INSERT OR IGNORE INTO blocks')) {
        const [id, blocker_id, blocked_id, created_at] = params;
        state.blocks.push({ id, blocker_id, blocked_id, created_at });
        return { changes: 1 };
      }
      if (s.startsWith('UPDATE friend_requests SET status =')) {
        const match = s.match(/SET status\s*=\s*'([^']+)'/i);
        const status = match ? match[1] : 'PENDING';
        const updated_at = params[0];
        const id = params[1];
        const req = state.friend_requests.find(r => r.id === id);
        if (req) {
          req.status = status;
          req.updated_at = updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      if (s.startsWith('DELETE FROM friendships')) {
        // DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        const [u1, f1, u2, f2] = params;
        const initialLen = state.friendships.length;
        state.friendships = state.friendships.filter(
          f => !(
            (f.user_id === u1 && f.friend_id === f1) ||
            (f.user_id === u2 && f.friend_id === f2)
          )
        );
        return { changes: initialLen - state.friendships.length };
      }
      if (s.startsWith('DELETE FROM friend_requests')) {
        const [u1, u2, u3, u4] = params;
        state.friend_requests = state.friend_requests.filter(
          r => !(
            (r.sender_id === u1 && r.receiver_id === u2) ||
            (r.sender_id === u3 && r.receiver_id === u4)
          )
        );
        return { changes: 1 };
      }
      if (s.startsWith('DELETE FROM blocks')) {
        const [blocker_id, blocked_id] = params;
        state.blocks = state.blocks.filter(b => !(b.blocker_id === blocker_id && b.blocked_id === blocked_id));
        return { changes: 1 };
      }
      return { changes: 1 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM blocks')) {
        const [p1, p2, p3, p4] = params;
        return state.blocks.find(
          b => (b.blocker_id === p1 && b.blocked_id === p2) || (b.blocker_id === p3 && b.blocked_id === p4)
        ) || null;
      }
      if (s.includes('FROM friendships WHERE user_id = ? AND friend_id = ?')) {
        const [u, f] = params;
        return state.friendships.find(fr => fr.user_id === u && fr.friend_id === f) || null;
      }
      if (s.includes('FROM privacy_settings WHERE user_id = ?')) {
        const [userId] = params;
        return state.privacy_settings.find(ps => ps.user_id === userId) || { allow_friend_requests: 1 };
      }
      if (s.includes('FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = \'PENDING\'')) {
        const [sId, rId] = params;
        return state.friend_requests.find(r => r.sender_id === sId && r.receiver_id === rId && r.status === 'PENDING') || null;
      }
      if (s.includes('FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = \'PENDING\'')) {
        const [reqId, rId] = params;
        return state.friend_requests.find(r => r.id === reqId && r.receiver_id === rId && r.status === 'PENDING') || null;
      }
      if (s.includes('FROM profiles WHERE UPPER(friend_code) = UPPER(?)')) {
        const code = params[0]?.toUpperCase();
        return state.profiles.find(p => p.friend_code?.toUpperCase() === code) || null;
      }
      if (s.includes('FROM profiles WHERE id = ?')) {
        const [id] = params;
        return state.profiles.find(p => p.id === id) || null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM profiles p') && s.includes('UPPER(p.friend_code) = ?')) {
        const [currentUserId, code, patternUser, patternDisplay] = params;
        const queryTerm = patternUser.replace(/%/g, '').toLowerCase();
        return state.profiles.filter(p => {
          if (p.id === currentUserId) return false;
          // check blocks
          const isBlocked = state.blocks.some(
            b => (b.blocker_id === currentUserId && b.blocked_id === p.id) ||
                 (b.blocker_id === p.id && b.blocked_id === currentUserId)
          );
          if (isBlocked) return false;
          return (
            p.friend_code?.toUpperCase() === code ||
            p.username.toLowerCase().includes(queryTerm) ||
            p.display_name.toLowerCase().includes(queryTerm)
          );
        });
      }
      if (s.includes('FROM friendships f') && s.includes('JOIN profiles p ON f.friend_id = p.id')) {
        const userId = params[0];
        const friendIds = state.friendships.filter(f => f.user_id === userId).map(f => f.friend_id);
        return state.profiles.filter(p => friendIds.includes(p.id));
      }
      if (s.includes('FROM friend_requests fr') && s.includes('JOIN profiles p ON fr.sender_id = p.id')) {
        const userId = params[0];
        return state.friend_requests
          .filter(r => r.receiver_id === userId && r.status === 'PENDING')
          .map(r => {
            const sender = state.profiles.find(p => p.id === r.sender_id);
            return {
              ...r,
              username: sender?.username || 'user',
              display_name: sender?.display_name || 'Operative',
              avatar_url: sender?.avatar_url || '⚔️',
              friend_code: sender?.friend_code || 'ASC-0000',
              global_level: sender?.global_level || 1,
              rank_tier: sender?.rank_tier || 'E',
              rank_division: sender?.rank_division || 4,
              current_streak: sender?.current_streak || 0,
            };
          });
      }
      if (s.includes('FROM friend_requests fr') && s.includes('JOIN profiles p ON fr.receiver_id = p.id')) {
        const userId = params[0];
        return state.friend_requests
          .filter(r => r.sender_id === userId && r.status === 'PENDING')
          .map(r => {
            const receiver = state.profiles.find(p => p.id === r.receiver_id);
            return {
              ...r,
              username: receiver?.username || 'user',
              display_name: receiver?.display_name || 'Operative',
              avatar_url: receiver?.avatar_url || '⚔️',
              friend_code: receiver?.friend_code || 'ASC-0000',
              global_level: receiver?.global_level || 1,
              rank_tier: receiver?.rank_tier || 'E',
              rank_division: receiver?.rank_division || 4,
              current_streak: receiver?.current_streak || 0,
            };
          });
      }
      return [];
    }),
  };

  return { mockDb: db, tables: state };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

describe('Two-User Friend Lifecycle & Handshake Protocols', () => {
  const userA = {
    id: 'user-alpha',
    username: 'vanguard_alpha',
    display_name: 'Alpha Vanguard',
    avatar_url: '⚔️',
    friend_code: 'ASC-ALPH-0001',
    global_level: 25,
    rank_tier: 'B',
    rank_division: 2,
    current_streak: 12,
  };

  const userB = {
    id: 'user-bravo',
    username: 'iron_bravo',
    display_name: 'Bravo Operator',
    avatar_url: '🛡️',
    friend_code: 'ASC-BRAV-0002',
    global_level: 18,
    rank_tier: 'C',
    rank_division: 1,
    current_streak: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tables.profiles = [{ ...userA }, { ...userB }];
    tables.friendships = [];
    tables.friend_requests = [];
    tables.blocks = [];
    tables.privacy_settings = [
      { user_id: userA.id, allow_friend_requests: 1 },
      { user_id: userB.id, allow_friend_requests: 1 },
    ];
  });

  it('Step 1: User A searches for User B by friend code and callsign', async () => {
    // Search by exact friend code
    const byCode = await FriendService.searchOperatives(userA.id, 'ASC-BRAV-0002');
    expect(byCode.length).toBe(1);
    expect(byCode[0].id).toBe(userB.id);
    expect(byCode[0].displayName).toBe('Bravo Operator');
    expect(byCode[0].friendCode).toBe('ASC-BRAV-0002');

    // Direct lookup by friend code
    const direct = await FriendService.lookupByFriendCode('ASC-BRAV-0002');
    expect(direct).not.toBeNull();
    expect(direct?.id).toBe(userB.id);

    // Search by username pattern
    const byName = await FriendService.searchOperatives(userA.id, 'iron');
    expect(byName.length).toBe(1);
    expect(byName[0].id).toBe(userB.id);

    // Cannot search for self
    const selfSearch = await FriendService.searchOperatives(userA.id, 'ASC-ALPH-0001');
    expect(selfSearch.length).toBe(0);
  });

  it('Step 2 & 3: User A sends request, User B accepts, A sees B, B sees A', async () => {
    // Initially neither is friends
    const friendsBeforeA = await FriendService.getFriends(userA.id);
    const friendsBeforeB = await FriendService.getFriends(userB.id);
    expect(friendsBeforeA).toHaveLength(0);
    expect(friendsBeforeB).toHaveLength(0);

    // User A sends request to User B by friend code
    const req = await FriendService.sendFriendRequest(userA.id, 'ASC-BRAV-0002');
    expect(req).toBeDefined();
    expect(req.senderId).toBe(userA.id);
    expect(req.receiverId).toBe(userB.id);
    expect(req.status).toBe('PENDING');

    // User B checks incoming requests -> sees User A
    const incomingB = await FriendService.getIncomingRequests(userB.id);
    expect(incomingB).toHaveLength(1);
    expect(incomingB[0].senderId).toBe(userA.id);
    expect(incomingB[0].sender?.displayName).toBe('Alpha Vanguard');

    // User A checks outgoing requests -> sees User B
    const outgoingA = await FriendService.getOutgoingRequests(userA.id);
    expect(outgoingA).toHaveLength(1);
    expect(outgoingA[0].receiverId).toBe(userB.id);
    expect(outgoingA[0].receiver?.displayName).toBe('Bravo Operator');

    // User B accepts the request
    await FriendService.acceptFriendRequest(userB.id, req.id);

    // VERIFICATION 1: User A sees User B in friends list (A sees B)
    const friendsA = await FriendService.getFriends(userA.id);
    expect(friendsA).toHaveLength(1);
    expect(friendsA[0].id).toBe(userB.id);
    expect(friendsA[0].displayName).toBe('Bravo Operator');
    expect(friendsA[0].rankTier).toBe('C');

    // VERIFICATION 2: User B sees User A in friends list (B sees A)
    const friendsB = await FriendService.getFriends(userB.id);
    expect(friendsB).toHaveLength(1);
    expect(friendsB[0].id).toBe(userA.id);
    expect(friendsB[0].displayName).toBe('Alpha Vanguard');
    expect(friendsB[0].rankTier).toBe('B');

    // VERIFICATION 3: Mutual bilateral relationship check
    const relAB = await FriendService.getRelationship(userA.id, userB.id);
    const relBA = await FriendService.getRelationship(userB.id, userA.id);
    expect(relAB).toBe('FRIEND');
    expect(relBA).toBe('FRIEND');
  });

  it('Step 4: Removing friend dissolves friendship in both directions', async () => {
    // Establish friendship
    const req = await FriendService.sendFriendRequest(userA.id, 'ASC-BRAV-0002');
    await FriendService.acceptFriendRequest(userB.id, req.id);

    expect(await FriendService.getFriends(userA.id)).toHaveLength(1);
    expect(await FriendService.getFriends(userB.id)).toHaveLength(1);

    // User A removes User B
    await FriendService.removeFriend(userA.id, userB.id);

    // Neither sees the other in squad roster
    expect(await FriendService.getFriends(userA.id)).toHaveLength(0);
    expect(await FriendService.getFriends(userB.id)).toHaveLength(0);

    const relAB = await FriendService.getRelationship(userA.id, userB.id);
    expect(relAB).toBe('NONE');
  });

  it('Step 5: User B rejects request -> status REJECTED and no friendship created', async () => {
    const req = await FriendService.sendFriendRequest(userA.id, 'ASC-BRAV-0002');
    await FriendService.rejectFriendRequest(userB.id, req.id);

    const requestInDb = tables.friend_requests.find(r => r.id === req.id);
    expect(requestInDb?.status).toBe('REJECTED');

    expect(await FriendService.getFriends(userA.id)).toHaveLength(0);
    expect(await FriendService.getFriends(userB.id)).toHaveLength(0);
  });

  it('Step 6: User A cancels outgoing request', async () => {
    const req = await FriendService.sendFriendRequest(userA.id, 'ASC-BRAV-0002');
    await FriendService.cancelFriendRequest(userA.id, req.id);

    const requestInDb = tables.friend_requests.find(r => r.id === req.id);
    expect(requestInDb?.status).toBe('CANCELLED');
  });
});
