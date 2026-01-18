import { databaseManager, UserWalletMapping } from './database-manager.js';

export class UserMappingManager {
  constructor() {
    // Initialize database connection
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await databaseManager.connect();
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
    }
  }

  /**
   * Add a new user wallet mapping
   */
  async addMapping(discordId: string, privyWalletId: string, walletAddress: string, chainType: string = 'base'): Promise<void> {
    const success = await databaseManager.createUserMapping({
      discordId,
      privyWalletId,
      walletAddress,
      chainType,
      createdAt: new Date()
    });

    if (success) {
      console.log(`🔗 Mapped Discord user ${discordId} to Privy wallet ${privyWalletId}`);
    } else {
      console.error(`❌ Failed to map Discord user ${discordId} to wallet`);
    }
  }

  /**
   * Get wallet mapping for a Discord user
   */
  async getMapping(discordId: string): Promise<UserWalletMapping | null> {
    return await databaseManager.getUserMapping(discordId);
  }

  /**
   * Check if user has a wallet
   */
  async hasWallet(discordId: string): Promise<boolean> {
    const mapping = await databaseManager.getUserMapping(discordId);
    return mapping !== null;
  }

  /**
   * Get all mappings (for admin purposes)
   */
  async getAllMappings(): Promise<UserWalletMapping[]> {
    return await databaseManager.getAllUserMappings();
  }

  /**
   * Update whale status for a user
   */
  async updateWhaleStatus(discordId: string, isWhale: boolean): Promise<boolean> {
    return await databaseManager.updateUserWhaleStatus(discordId, isWhale);
  }

  /**
   * Get users by whale status
   */
  async getUsersByWhaleStatus(isWhale: boolean): Promise<UserWalletMapping[]> {
    const allMappings = await this.getAllMappings();
    return allMappings.filter(mapping => mapping.isWhale === isWhale);
  }

  /**
   * Get mapping statistics
   */
  async getStats(): Promise<{
    totalUsers: number;
    whales: number;
    chainTypes: { [key: string]: number };
  }> {
    const allMappings = await this.getAllMappings();
    
    const stats = {
      totalUsers: allMappings.length,
      whales: allMappings.filter(m => m.isWhale).length,
      chainTypes: {} as { [key: string]: number }
    };

    // Count by chain type
    allMappings.forEach(mapping => {
      const chainType = mapping.chainType || 'unknown';
      stats.chainTypes[chainType] = (stats.chainTypes[chainType] || 0) + 1;
    });

    return stats;
  }

  /**
   * Find mapping by wallet address
   */
  async findByWalletAddress(address: string): Promise<UserWalletMapping | null> {
    const allMappings = await this.getAllMappings();
    return allMappings.find(mapping => mapping.walletAddress.toLowerCase() === address.toLowerCase()) || null;
  }

  /**
   * Find mapping by Privy wallet ID
   */
  async findByPrivyWalletId(walletId: string): Promise<UserWalletMapping | null> {
    const allMappings = await this.getAllMappings();
    return allMappings.find(mapping => mapping.privyWalletId === walletId) || null;
  }
}
