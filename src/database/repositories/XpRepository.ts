import { getDatabase } from '../sqlite';
import { SyncQueueRepository } from './SyncQueueRepository';

export interface XpTransactionRecord {
  id: string;
  userId: string;
  sourceType: 'WORKOUT' | 'QUEST' | 'ACHIEVEMENT' | 'PR' | 'SET' | 'EXERCISE' | 'MILESTONE' | 'CHALLENGE';
  sourceId: string;
  amount: number;
  description: string;
  createdAt: string;
  xpType?: 'PLAYER' | 'EXERCISE';
  exerciseId?: string | null;
}

export interface RecordXpResult {
  awarded: boolean;
  amountAwarded: number;
  transactionId: string;
}

export class XpRepository {
  /**
   * Deterministically records an XP transaction.
   * Guarantees strict idempotency: if a transaction with the same (user_id, source_type, source_id)
   * already exists, duplicate insertion is ignored, total_xp is NOT incremented, and awarded is false.
   * PLAYER XP increments profile total_xp. EXERCISE XP is recorded to the exercise ledger.
   */
  static async recordTransaction(
    userId: string,
    sourceType: 'WORKOUT' | 'QUEST' | 'ACHIEVEMENT' | 'PR' | 'SET' | 'EXERCISE' | 'MILESTONE' | 'CHALLENGE',
    sourceId: string,
    amount: number,
    description: string,
    createdAt?: string,
    xpType: 'PLAYER' | 'EXERCISE' = 'PLAYER',
    exerciseId?: string
  ): Promise<RecordXpResult> {
    if (amount <= 0) {
      return { awarded: false, amountAwarded: 0, transactionId: '' };
    }

    const db = await getDatabase();
    const now = createdAt || new Date().toISOString();
    // Deterministic transaction ID
    const txId = `tx-${sourceType.toLowerCase()}-${userId}-${sourceId}`;

    const insertResult = await db.runAsync(
      `INSERT OR IGNORE INTO xp_transactions (
        id, user_id, source_type, source_id, amount, description, xp_type, exercise_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [txId, userId, sourceType, sourceId, amount, description, xpType, exerciseId || null, now]
    );

    // Only update profile total_xp if a new transaction was created AND it is PLAYER XP
    if ((insertResult?.changes ?? 0) > 0) {
      if (xpType === 'PLAYER') {
        await db.runAsync(
          `UPDATE profiles SET total_xp = total_xp + ?, updated_at = ? WHERE id = ?;`,
          [amount, now, userId]
        );
      }

      // Enqueue to sync queue with deterministic idempotency key
      await SyncQueueRepository.enqueue(
        'xp_transaction',
        txId,
        'INSERT',
        {
          id: txId,
          user_id: userId,
          source_type: sourceType,
          source_id: sourceId,
          amount,
          description,
          xp_type: xpType,
          exercise_id: exerciseId || null,
          created_at: now,
        },
        txId
      );

      return {
        awarded: true,
        amountAwarded: amount,
        transactionId: txId,
      };
    }

    // Transaction was already recorded previously -> skip XP award
    return {
      awarded: false,
      amountAwarded: 0,
      transactionId: txId,
    };
  }

  /**
   * Checks if an XP transaction already exists for this source.
   */
  static async hasTransaction(
    userId: string,
    sourceType: string,
    sourceId: string
  ): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM xp_transactions 
       WHERE user_id = ? AND source_type = ? AND source_id = ? 
       LIMIT 1;`,
      [userId, sourceType, sourceId]
    );
    return Boolean(row);
  }

  /**
   * Retrieves all XP transactions for the user ordered by creation date descending.
   */
  static async getTransactions(
    userId: string,
    limit: number = 50
  ): Promise<XpTransactionRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      user_id: string;
      source_type: string;
      source_id: string;
      amount: number;
      description: string;
      xp_type?: 'PLAYER' | 'EXERCISE';
      exercise_id?: string | null;
      created_at: string;
    }>(
      `SELECT * FROM xp_transactions 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?;`,
      [userId, limit]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      sourceType: r.source_type as any,
      sourceId: r.source_id,
      amount: r.amount,
      description: r.description,
      xpType: r.xp_type || 'PLAYER',
      exerciseId: r.exercise_id || null,
      createdAt: r.created_at,
    }));
  }

  /**
   * Calculates total lifetime XP recorded in the transaction ledger.
   */
  static async getLedgerTotalXp(userId: string): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total_xp: number | null }>(
      `SELECT SUM(amount) as total_xp FROM xp_transactions WHERE user_id = ?;`,
      [userId]
    );
    return row?.total_xp || 0;
  }
}
