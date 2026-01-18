import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import { databaseManager, LegacyWallet } from './database-manager.js';

declare var process: any;

export class WalletManagerMongo {
  private encryptionKey: string;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.encryptionKey = process.env.WALLET_ENCRYPTION_KEY || 'default-encryption-key-change-this';
    
    // Initialize Base chain provider with Alchemy RPC
    this.provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/POcytJtZjkzStgaMseE9BxpHexaC4Tfj'
    );
    
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await databaseManager.connect();
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
    }
  }

  private encryptPrivateKey(privateKey: string): string {
    return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
  }

  private decryptPrivateKey(encryptedPrivateKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedPrivateKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Create a new wallet for a Discord user
   */
  async createWallet(discordId: string): Promise<LegacyWallet> {
    // Check if user already has a wallet
    const existingWallet = await databaseManager.getLegacyWallet(discordId);
    if (existingWallet) {
      throw new Error('User already has a wallet');
    }

    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    const encryptedPrivateKey = this.encryptPrivateKey(wallet.privateKey);

    const userWallet: Omit<LegacyWallet, '_id'> = {
      discordId,
      encryptedPrivateKey,
      publicKey: wallet.publicKey,
      address: wallet.address,
      createdAt: new Date()
    };

    // Save wallet to database
    const success = await databaseManager.createLegacyWallet(userWallet);
    if (!success) {
      throw new Error('Failed to save wallet to database');
    }

    return userWallet as LegacyWallet;
  }

  /**
   * Get wallet for a Discord user
   */
  async getWallet(discordId: string): Promise<LegacyWallet | null> {
    return await databaseManager.getLegacyWallet(discordId);
  }

  /**
   * Get wallet instance for transactions
   */
  async getWalletInstance(discordId: string): Promise<ethers.Wallet | null> {
    const userWallet = await this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      const privateKey = this.decryptPrivateKey(userWallet.encryptedPrivateKey);
      return new ethers.Wallet(privateKey, this.provider);
    } catch (error) {
      console.error('Error decrypting wallet:', error);
      return null;
    }
  }

  /**
   * Get ETH balance for a user's wallet
   */
  async getBalance(discordId: string): Promise<string | null> {
    const userWallet = await this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      const balance = await this.provider.getBalance(userWallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      return null;
    }
  }

  /**
   * Get ETH balance for a specific address
   */
  async getBalanceForAddress(address: string): Promise<string | null> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting balance for address:', error);
      return null;
    }
  }

  /**
   * Get token balance for ERC-20 tokens
   */
  async getTokenBalance(discordId: string, tokenAddress: string): Promise<string | null> {
    const userWallet = await this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      // ERC-20 ABI for balanceOf function
      const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
      const balance = await contract.balanceOf(userWallet.address);
      const decimals = await contract.decimals();

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting token balance:', error);
      return null;
    }
  }

  /**
   * Get token balance for a specific address
   */
  async getTokenBalanceForAddress(address: string, tokenAddress: string): Promise<string | null> {
    try {
      // ERC-20 ABI for balanceOf function
      const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting token balance for address:', error);
      return null;
    }
  }

  /**
   * Send ETH to another address
   */
  async sendEth(discordId: string, toAddress: string, amount: string): Promise<string | null> {
    const walletInstance = await this.getWalletInstance(discordId);
    if (!walletInstance) {
      console.error('No wallet found for user');
      return null;
    }

    try {
      const transaction = {
        to: toAddress,
        value: ethers.parseEther(amount)
      };

      const tx = await walletInstance.sendTransaction(transaction);
      console.log(`ETH transaction sent: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error('Error sending ETH:', error);
      return null;
    }
  }

  /**
   * Export private key for a user
   */
  async exportPrivateKey(discordId: string): Promise<string | null> {
    const userWallet = await this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      return this.decryptPrivateKey(userWallet.encryptedPrivateKey);
    } catch (error) {
      console.error('Error decrypting private key:', error);
      return null;
    }
  }

  /**
   * Send a transaction
   */
  async sendTransaction(discordId: string, transaction: any): Promise<string | null> {
    const walletInstance = await this.getWalletInstance(discordId);
    if (!walletInstance) {
      console.error('No wallet found for user');
      return null;
    }

    try {
      const tx = await walletInstance.sendTransaction(transaction);
      console.log(`Transaction sent: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error('Error sending transaction:', error);
      return null;
    }
  }

  /**
   * Get all wallets (for admin purposes)
   */
  async getAllWallets(): Promise<LegacyWallet[]> {
    return await databaseManager.getAllLegacyWallets();
  }

  /**
   * Get wallet statistics
   */
  async getStats(): Promise<{
    totalWallets: number;
    totalBalance: number;
    averageBalance: number;
  }> {
    const wallets = await this.getAllWallets();
    let totalBalance = 0;

    for (const wallet of wallets) {
      const balance = await this.getBalanceForAddress(wallet.address);
      if (balance) {
        totalBalance += parseFloat(balance);
      }
    }

    return {
      totalWallets: wallets.length,
      totalBalance,
      averageBalance: wallets.length > 0 ? totalBalance / wallets.length : 0
    };
  }

  /**
   * Health check for the wallet manager
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check database connection
      const dbHealth = await databaseManager.ping();
      
      // Check RPC connection
      await this.provider.getBlockNumber();
      
      return dbHealth;
    } catch (error) {
      console.error('Wallet manager health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const walletManagerMongo = new WalletManagerMongo();
