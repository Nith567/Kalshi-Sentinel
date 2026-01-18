import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import * as fs from 'fs';
import * as path from 'path';

declare var process: any;

interface UserWallet {
  discordId: string;
  encryptedPrivateKey: string;
  publicKey: string;
  address: string;
  createdAt: string;
}

interface WalletStore {
  wallets: { [discordId: string]: UserWallet };
}

export class WalletManager {
  private walletsFilePath: string;
  private encryptionKey: string;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.walletsFilePath = path.join(process.cwd(), 'data', 'wallets.json');
    this.encryptionKey = process.env.WALLET_ENCRYPTION_KEY || 'default-encryption-key-change-this';
    
    // Initialize Base chain provider with Alchemy RPC
    this.provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/POcytJtZjkzStgaMseE9BxpHexaC4Tfj'
    );
    
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    const dataDir = path.dirname(this.walletsFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadWallets(): WalletStore {
    if (!fs.existsSync(this.walletsFilePath)) {
      return { wallets: {} };
    }
    
    try {
      const data = fs.readFileSync(this.walletsFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading wallets:', error);
      return { wallets: {} };
    }
  }

  private saveWallets(walletStore: WalletStore): void {
    try {
      fs.writeFileSync(this.walletsFilePath, JSON.stringify(walletStore, null, 2));
    } catch (error) {
      console.error('Error saving wallets:', error);
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
  async createWallet(discordId: string): Promise<UserWallet> {
    const walletStore = this.loadWallets();
    
    // Check if user already has a wallet
    if (walletStore.wallets[discordId]) {
      throw new Error('User already has a wallet');
    }

    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    const encryptedPrivateKey = this.encryptPrivateKey(wallet.privateKey);

    const userWallet: UserWallet = {
      discordId,
      encryptedPrivateKey,
      publicKey: wallet.publicKey,
      address: wallet.address,
      createdAt: new Date().toISOString()
    };

    // Save wallet
    walletStore.wallets[discordId] = userWallet;
    this.saveWallets(walletStore);

    return userWallet;
  }

  /**
   * Get wallet for a Discord user
   */
  getWallet(discordId: string): UserWallet | null {
    const walletStore = this.loadWallets();
    return walletStore.wallets[discordId] || null;
  }

  /**
   * Get wallet instance for transactions
   */
  getWalletInstance(discordId: string): ethers.Wallet | null {
    const userWallet = this.getWallet(discordId);
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
    const userWallet = this.getWallet(discordId);
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
   * Get token balance for ERC-20 tokens
   */
  async getTokenBalance(discordId: string, tokenAddress: string): Promise<string | null> {
    const userWallet = this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      // ERC-20 ABI for balanceOf function
      const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
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
   * Send ETH transaction
   */
  async sendEth(discordId: string, toAddress: string, amount: string): Promise<string | null> {
    const wallet = this.getWalletInstance(discordId);
    if (!wallet) return null;

    try {
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount)
      });

      return tx.hash;
    } catch (error) {
      console.error('Error sending ETH:', error);
      return null;
    }
  }

  /**
   * Send generic transaction
   */
  async sendTransaction(discordId: string, txData: {
    to: string;
    value?: string;
    data?: string;
    gasLimit?: string;
  }): Promise<{ data: { hash: string } } | null> {
    const wallet = this.getWalletInstance(discordId);
    if (!wallet) return null;

    try {
      const tx = await wallet.sendTransaction({
        to: txData.to,
        value: txData.value || '0',
        data: txData.data || '0x',
        gasLimit: txData.gasLimit || '21000'
      });

      return { data: { hash: tx.hash } };
    } catch (error) {
      console.error('Error sending transaction:', error);
      return null;
    }
  }

  /**
   * List all wallets (admin function)
   */
  getAllWallets(): UserWallet[] {
    const walletStore = this.loadWallets();
    return Object.keys(walletStore.wallets).map(key => walletStore.wallets[key]);
  }

  /**
   * Export private key for a Discord user (USE WITH EXTREME CAUTION)
   */
  exportPrivateKey(discordId: string): string | null {
    const userWallet = this.getWallet(discordId);
    if (!userWallet) return null;

    try {
      return this.decryptPrivateKey(userWallet.encryptedPrivateKey);
    } catch (error) {
      console.error('Error decrypting private key for export:', error);
      return null;
    }
  }

  /**
   * Delete a wallet (be careful with this!)
   */
  deleteWallet(discordId: string): boolean {
    const walletStore = this.loadWallets();
    
    if (!walletStore.wallets[discordId]) {
      return false;
    }

    delete walletStore.wallets[discordId];
    this.saveWallets(walletStore);
    return true;
  }
}

export const walletManager = new WalletManager();
