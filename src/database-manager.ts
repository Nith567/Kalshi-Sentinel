import { MongoClient, ServerApiVersion, Db, Collection } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

declare var process: any;

export interface UserWalletMapping {
  discordId: string;
  privyWalletId: string;
  walletAddress: string;
  createdAt: Date;
  chainType: string;
  isWhale?: boolean;
  lastBalanceCheck?: Date;
}

export interface LegacyWallet {
  discordId: string;
  encryptedPrivateKey: string;
  publicKey: string;
  address: string;
  createdAt: Date;
}

export interface WhaleRoleConfig {
  serverId: string;
  roleId: string;
  threshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export class DatabaseManager {
  private client: MongoClient;
  private db: Db | null = null;
  private isConnected: boolean = false;

  // Collections
  private userMappingsCollection: Collection<UserWalletMapping> | null = null;
  private legacyWalletsCollection: Collection<LegacyWallet> | null = null;
  private whaleRolesCollection: Collection<WhaleRoleConfig> | null = null;

  constructor() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      // Connection options for MongoDB Atlas
      retryWrites: true,
      w: 'majority',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 10000,
      // Try without strict TLS validation
      tls: true,
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.db = this.client.db('cryptonomads-bot');
        
        // Initialize collections
        this.userMappingsCollection = this.db.collection<UserWalletMapping>('user_mappings');
        this.legacyWalletsCollection = this.db.collection<LegacyWallet>('legacy_wallets');
        this.whaleRolesCollection = this.db.collection<WhaleRoleConfig>('whale_roles');
        
        // Create indexes for better performance
        await this.createIndexes();
        
        this.isConnected = true;
        console.log('✅ Connected to MongoDB successfully!');
      }
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      if (this.userMappingsCollection) {
        await this.userMappingsCollection.createIndex({ discordId: 1 }, { unique: true });
        await this.userMappingsCollection.createIndex({ walletAddress: 1 });
        await this.userMappingsCollection.createIndex({ privyWalletId: 1 });
      }

      if (this.legacyWalletsCollection) {
        await this.legacyWalletsCollection.createIndex({ discordId: 1 }, { unique: true });
        await this.legacyWalletsCollection.createIndex({ address: 1 });
      }

      if (this.whaleRolesCollection) {
        await this.whaleRolesCollection.createIndex({ serverId: 1 }, { unique: true });
      }

      console.log('📊 Database indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating indexes:', error);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.close();
        this.isConnected = false;
        console.log('🔌 Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
    }
  }

  // User Mapping Methods
  async getUserMapping(discordId: string): Promise<UserWalletMapping | null> {
    await this.ensureConnected();
    return await this.userMappingsCollection!.findOne({ discordId });
  }

  async createUserMapping(mapping: Omit<UserWalletMapping, '_id'>): Promise<boolean> {
    await this.ensureConnected();
    try {
      await this.userMappingsCollection!.insertOne({
        ...mapping,
        createdAt: new Date(),
        isWhale: false,
        lastBalanceCheck: new Date()
      } as UserWalletMapping);
      return true;
    } catch (error) {
      console.error('❌ Error creating user mapping:', error);
      return false;
    }
  }

  async updateUserWhaleStatus(discordId: string, isWhale: boolean): Promise<boolean> {
    await this.ensureConnected();
    try {
      await this.userMappingsCollection!.updateOne(
        { discordId },
        { 
          $set: { 
            isWhale, 
            lastBalanceCheck: new Date() 
          } 
        }
      );
      return true;
    } catch (error) {
      console.error('❌ Error updating whale status:', error);
      return false;
    }
  }

  async getAllUserMappings(): Promise<UserWalletMapping[]> {
    await this.ensureConnected();
    return await this.userMappingsCollection!.find({}).toArray();
  }

  // Legacy Wallet Methods
  async getLegacyWallet(discordId: string): Promise<LegacyWallet | null> {
    await this.ensureConnected();
    return await this.legacyWalletsCollection!.findOne({ discordId });
  }

  async createLegacyWallet(wallet: Omit<LegacyWallet, '_id'>): Promise<boolean> {
    await this.ensureConnected();
    try {
      await this.legacyWalletsCollection!.insertOne(wallet as LegacyWallet);
      return true;
    } catch (error) {
      console.error('❌ Error creating legacy wallet:', error);
      return false;
    }
  }

  async getAllLegacyWallets(): Promise<LegacyWallet[]> {
    await this.ensureConnected();
    return await this.legacyWalletsCollection!.find({}).toArray();
  }

  // Whale Role Methods
  async getWhaleRoleConfig(serverId: string): Promise<WhaleRoleConfig | null> {
    await this.ensureConnected();
    return await this.whaleRolesCollection!.findOne({ serverId });
  }

  async setWhaleRoleConfig(config: Omit<WhaleRoleConfig, '_id'>): Promise<boolean> {
    await this.ensureConnected();
    try {
      await this.whaleRolesCollection!.replaceOne(
        { serverId: config.serverId },
        { 
          ...config,
          updatedAt: new Date()
        } as WhaleRoleConfig,
        { upsert: true }
      );
      return true;
    } catch (error) {
      console.error('❌ Error setting whale role config:', error);
      return false;
    }
  }

  // Migration Methods
  async migrateFromJSON(): Promise<void> {
    console.log('🔄 Starting migration from JSON files...');
    
    try {
      // Import existing data if files exist
      const fs = await import('fs');
      const path = await import('path');
      
      // Migrate user mappings from privy-mappings.json
      const privyMappingsPath = path.join(process.cwd(), 'data', 'privy-mappings.json');
      if (fs.existsSync(privyMappingsPath)) {
        const mappingsData = JSON.parse(fs.readFileSync(privyMappingsPath, 'utf-8'));
        for (const mapping of mappingsData) {
          await this.createUserMapping({
            discordId: mapping.discordId,
            privyWalletId: mapping.privyWalletId,
            walletAddress: mapping.walletAddress,
            createdAt: new Date(mapping.createdAt),
            chainType: mapping.chainType || 'base'
          });
        }
        console.log(`✅ Migrated ${mappingsData.length} user mappings`);
      }

      // Migrate legacy wallets from wallets.json
      const walletsPath = path.join(process.cwd(), 'data', 'wallets.json');
      if (fs.existsSync(walletsPath)) {
        const walletsData = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
        for (const [discordId, wallet] of Object.entries(walletsData.wallets || {})) {
          await this.createLegacyWallet({
            discordId,
            ...(wallet as any),
            createdAt: new Date((wallet as any).createdAt)
          });
        }
        console.log(`✅ Migrated ${Object.keys(walletsData.wallets || {}).length} legacy wallets`);
      }

      console.log('🎉 Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration error:', error);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      await this.ensureConnected();
      await this.db!.admin().ping();
      return true;
    } catch (error) {
      console.error('❌ Database ping failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager();
