/**
 * WebSocket Alert Manager
 * Monitor price changes and alert users via DM
 */

import WebSocket from 'ws';
import { Client, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';

export interface PriceAlert {
  userId: string;
  marketTicker: string;
  side: 'yes' | 'no';
  basePrice: number;
  percentageThreshold: number; // e.g., 10 for 10%
  apiKey: string;
  privateKey: string;
}

interface MarketUpdate {
  market_ticker: string;
  yes_price?: number;
  no_price?: number;
  timestamp?: number;
}

export class AlertManager {
  private activeAlerts: Map<string, WebSocket> = new Map();
  private discordClient: Client | null = null;

  setDiscordClient(client: Client) {
    this.discordClient = client;
  }

  /**
   * Start monitoring a market with price alerts
   */
  startAlert(alert: PriceAlert) {
    const alertId = `${alert.userId}-${alert.marketTicker}-${alert.side}`;

    // Stop existing alert if running
    if (this.activeAlerts.has(alertId)) {
      const existingWs = this.activeAlerts.get(alertId);
      if (existingWs) existingWs.close();
    }

    const WS_URL = process.env.KALSHI_BASE_URL?.includes('demo') 
      ? 'wss://demo-api.kalshi.co/trade-api/ws/v2'
      : 'wss://api.elections.kalshi.com/trade-api/ws/v2';

    console.log(`🔌 Starting alert for ${alertId}...`);

    try {
      // Generate authentication headers for WebSocket
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = timestamp + 'GET/trade-api/ws/v2';
      
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      const signature = sign.sign({
        key: alert.privateKey,
        format: 'pem',
        type: 'pkcs8',
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      }, 'base64');

      const headers = {
        'KALSHI-ACCESS-KEY': alert.apiKey,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
      };

      const ws = new WebSocket(WS_URL, {
        headers,
      });

      ws.on('open', () => {
        console.log(`✅ WS connected for ${alertId}`);

        // Subscribe to market ticker
        ws.send(
          JSON.stringify({
            id: 1,
            cmd: 'subscribe',
            params: {
              channels: ['market_ticker'],
              market_ticker: alert.marketTicker,
            },
          })
        );
      });

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type !== 'market_ticker') return;

          const data: MarketUpdate = msg.data;

          if (data.market_ticker !== alert.marketTicker) return;

          const currentPrice =
            alert.side === 'yes' ? data.yes_price : data.no_price;

          if (!currentPrice) return;

          // 🔥 Check if threshold reached
          const triggerPrice = alert.basePrice * (1 + alert.percentageThreshold / 100);

          if (currentPrice >= triggerPrice) {
            console.log(`🚨 ALERT TRIGGERED for ${alertId}! Price: ${currentPrice}`);
            await this.sendAlert(alert, currentPrice, data);
            ws.close(); // Auto stop after trigger
            this.activeAlerts.delete(alertId);
          }
        } catch (err) {
          console.error('Error processing WS message:', err);
        }
      });

      ws.on('error', (err) => {
        console.error(`❌ WS error for ${alertId}:`, err);
      });

      ws.on('close', () => {
        console.log(`🔌 WS closed for ${alertId}`);
        this.activeAlerts.delete(alertId);
      });

      this.activeAlerts.set(alertId, ws);
    } catch (err) {
      console.error('Error starting alert:', err);
    }
  }

  /**
   * Send alert DM to user with market info
   */
  private async sendAlert(
    alert: PriceAlert,
    currentPrice: number,
    marketData: MarketUpdate
  ) {
    if (!this.discordClient) {
      console.error('Discord client not initialized');
      return;
    }

    try {
      // Fetch market details via API
      const marketInfo = await this.fetchMarketDetails(
        alert.marketTicker,
        alert.apiKey,
        alert.privateKey
      );

      // Get user
      const user = await this.discordClient.users.fetch(alert.userId);

      const percentageMove = (
        ((currentPrice - alert.basePrice) / alert.basePrice) *
        100
      ).toFixed(2);

      const embed = new EmbedBuilder()
        .setColor(0xff6b6b) // Red for alert
        .setTitle('🚨 Price Alert Triggered!')
        .setDescription(
          `**${alert.marketTicker}**\n\n${marketInfo?.title || 'Market'}`
        )
        .addFields(
          {
            name: '📊 Market Ticker',
            value: `\`${alert.marketTicker}\``,
            inline: true,
          },
          {
            name: '🎯 Event',
            value: `\`${marketInfo?.event_ticker || 'N/A'}\``,
            inline: true,
          },
          {
            name: '📈 Side Watched',
            value: alert.side.toUpperCase(),
            inline: true,
          },
          {
            name: '💰 Entry Price',
            value: `\`$${alert.basePrice.toFixed(4)}\``,
            inline: true,
          },
          {
            name: '⚡ Current Price',
            value: `\`$${currentPrice.toFixed(4)}\``,
            inline: true,
          },
          {
            name: `🔥 Movement`,
            value: `\`+${percentageMove}%\` 📈`,
            inline: true,
          },
          {
            name: '❓ Question',
            value:
              marketInfo?.title ||
              'N/A',
            inline: false,
          },
          {
            name: '📝 Details',
            value:
              marketInfo?.subtitle ||
              'No details available',
            inline: false,
          },
          {
            name: '🔄 Market Status',
            value: `\`${marketInfo?.status || 'UNKNOWN'}\``,
            inline: true,
          },
          {
            name: '💵 YES Price',
            value: `\`$${(marketData.yes_price || 0).toFixed(4)}\``,
            inline: true,
          },
          {
            name: '🚫 NO Price',
            value: `\`$${(marketData.no_price || 0).toFixed(4)}\``,
            inline: true,
          }
        )
        .setFooter({
          text: `Alert set at ${alert.percentageThreshold}% threshold • Use /alerts to manage`,
        })
        .setTimestamp();

      await user.send({ embeds: [embed] });
      console.log(`✅ Alert DM sent to user ${alert.userId}`);
    } catch (err) {
      console.error('Error sending alert DM:', err);
    }
  }

  /**
   * Fetch market details from Kalshi API
   */
  private async fetchMarketDetails(
    ticker: string,
    apiKey: string,
    privateKey: string
  ) {
    try {
      const method = 'GET';
      const apiPath = `/trade-api/v2/markets/${ticker}`;
      const timestampStr = Date.now().toString();

      const msgString = timestampStr + method + apiPath;

      const sign = crypto.createSign('RSA-SHA256');
      sign.update(msgString);
      sign.end();

      const signature = sign.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      });

      const headers = {
        'KALSHI-ACCESS-KEY': apiKey,
        'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
        'KALSHI-ACCESS-TIMESTAMP': timestampStr,
      };

      const response = await axios.get(KALSHI_BASE_URL + apiPath, { headers });
      return response.data.market;
    } catch (err) {
      console.error('Error fetching market details:', err);
      return null;
    }
  }

  /**
   * Stop an alert
   */
  stopAlert(userId: string, marketTicker: string, side: string) {
    const alertId = `${userId}-${marketTicker}-${side}`;
    const ws = this.activeAlerts.get(alertId);

    if (ws) {
      ws.close();
      this.activeAlerts.delete(alertId);
      return true;
    }

    return false;
  }

  /**
   * Get all active alerts for a user
   */
  getActiveAlerts(userId: string): string[] {
    return Array.from(this.activeAlerts.keys()).filter(key =>
      key.startsWith(userId)
    );
  }

  /**
   * Stop all alerts for a user
   */
  stopAllAlerts(userId: string) {
    const userAlerts = this.getActiveAlerts(userId);
    for (const alertId of userAlerts) {
      const ws = this.activeAlerts.get(alertId);
      if (ws) ws.close();
      this.activeAlerts.delete(alertId);
    }
    return userAlerts.length;
  }
}

// Export singleton
export const alertManager = new AlertManager();
