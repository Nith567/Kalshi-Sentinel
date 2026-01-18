/**
 * User Management for Kalshi API credentials
 * Stores Kalshi API Key + Private Key (both ENCRYPTED)
 * Tied to Discord user ID
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { encrypt, decrypt } from './encryption.js';

export interface KalshiUser {
  discord_id: string;
  kalshi_username: string;
  kalshi_api_key_encrypted: string;      // ← ENCRYPTED!
  kalshi_private_key_encrypted: string;  // ← ENCRYPTED!
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

export class KalshiUserManager {
  private db: Db | null = null;
  private usersCollection: Collection<KalshiUser> | null = null;

  async connect(mongoUri: string): Promise<void> {
    try {
      const client = new MongoClient(mongoUri);
      await client.connect();
      this.db = client.db('kalshi-bot');
      this.usersCollection = this.db.collection<KalshiUser>('kalshi_users');

      // Create indexes
      await this.usersCollection.createIndex({ discord_id: 1 }, { unique: true });

      console.log('✅ Connected to Kalshi user database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Link Kalshi account to Discord user
   * @param discordId - Discord user ID
   * @param kalshiUsername - Kalshi username
   * @param kalshiApiKey - Kalshi API Key (will be encrypted before storing)
   * @param kalshiPrivateKey - Kalshi Private Key (will be encrypted before storing)
   */
  async linkKalshiAccount(
    discordId: string,
    kalshiUsername: string,
    kalshiApiKey: string,
    kalshiPrivateKey: string
  ): Promise<KalshiUser> {
    if (!this.usersCollection) throw new Error('Database not connected');

    // Encrypt BOTH API Key and Private Key before storing
    const encryptedApiKey = encrypt(kalshiApiKey);
    const encryptedPrivateKey = encrypt(kalshiPrivateKey);

    const kalshiUser: KalshiUser = {
      discord_id: discordId,
      kalshi_username: kalshiUsername,
      kalshi_api_key_encrypted: encryptedApiKey,
      kalshi_private_key_encrypted: encryptedPrivateKey,
      created_at: new Date(),
      updated_at: new Date(),
      is_active: true,
    };

    await this.usersCollection.updateOne(
      { discord_id: discordId },
      { $set: kalshiUser },
      { upsert: true }
    );

    console.log(`✅ Linked Kalshi account for Discord user ${discordId}`);
    return kalshiUser;
  }

  /**
   * Get Kalshi user by Discord ID (with decrypted credentials)
   * Returns decrypted API Key and Private Key ready to use
   */
  async getKalshiUser(discordId: string): Promise<(KalshiUser & { 
    kalshi_api_key?: string;
    kalshi_private_key?: string;
  }) | null> {
    if (!this.usersCollection) throw new Error('Database not connected');

    const user = await this.usersCollection.findOne({
      discord_id: discordId,
      is_active: true,
    });

    if (!user) return null;

    // Decrypt BOTH credentials before returning
    const decryptedApiKey = decrypt(user.kalshi_api_key_encrypted);
    const decryptedPrivateKey = decrypt(user.kalshi_private_key_encrypted);

    return {
      ...user,
      kalshi_api_key: decryptedApiKey,
      kalshi_private_key: decryptedPrivateKey,
    };
  }

  /**
   * Unlink Kalshi account from Discord user
   */
  async unlinkKalshiAccount(discordId: string): Promise<boolean> {
    if (!this.usersCollection) throw new Error('Database not connected');

    const result = await this.usersCollection.updateOne(
      { discord_id: discordId },
      { $set: { is_active: false, updated_at: new Date() } }
    );

    return result.modifiedCount > 0;
  }
}

export const kalshiUserManager = new KalshiUserManager();
