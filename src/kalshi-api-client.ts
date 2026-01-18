/**
 * Kalshi API Client
 * For interacting with Kalshi prediction markets
 */

import axios, { AxiosInstance } from 'axios';

export interface KalshiMarket {
  event_ticker: string;
  title: string;
  subtitle?: string;
  category?: string;
  status: string;
  outcome_type: string;
  yes_price?: number;
  no_price?: number;
  open_interest?: number;
  volume_24h?: number;
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  price: number;
  quantity: number;
  status: string;
  created_at: string;
  filled_quantity?: number;
}

export interface KalshiPortfolio {
  username: string;
  balance_cents: number;
  net_contracts_value_cents: number;
  positions: any[];
}

export class KalshiAPIClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.kalshi.com/trade-api/v2') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  }

  /**
   * Get list of markets
   */
  async getMarkets(filters?: { status?: string; category?: string }): Promise<KalshiMarket[]> {
    try {
      const response = await this.client.get('/markets', { params: filters });
      return response.data.markets || [];
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw error;
    }
  }

  /**
   * Get market details
   */
  async getMarketDetails(ticker: string): Promise<KalshiMarket | null> {
    try {
      const response = await this.client.get(`/markets/${ticker}`);
      return response.data.market || null;
    } catch (error) {
      console.error('Error fetching market details:', error);
      throw error;
    }
  }

  /**
   * Place an order
   */
  async placeOrder(
    ticker: string,
    side: 'yes' | 'no',
    price: number,
    quantity: number
  ): Promise<KalshiOrder | null> {
    try {
      const response = await this.client.post('/orders', {
        ticker,
        side,
        price,
        quantity,
      });
      return response.data.order || null;
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/orders/${orderId}`);
      return true;
    } catch (error) {
      console.error('Error canceling order:', error);
      throw error;
    }
  }

  /**
   * Get portfolio
   */
  async getPortfolio(): Promise<KalshiPortfolio | null> {
    try {
      const response = await this.client.get('/portfolio');
      return response.data.portfolio || null;
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      throw error;
    }
  }

  /**
   * Get user orders
   */
  async getUserOrders(): Promise<KalshiOrder[]> {
    try {
      const response = await this.client.get('/orders');
      return response.data.orders || [];
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const kalshiAPIClient = new KalshiAPIClient(
  process.env.KALSHI_API_KEY || ''
);
