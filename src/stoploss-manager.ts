/**
 * Stop Loss Manager
 * Monitor positions and auto-execute sell orders when price drops
 */

import WebSocket from 'ws';
import { Client as DiscordClient, EmbedBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import crypto from 'crypto';
import { makeSignedGetRequest, makeSignedPostRequest } from './kalshi-request-signer.js';

dotenv.config();

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';

export interface StopLossOrder {
  userId: string;
  marketTicker: string;
  side: 'yes' | 'no';
  basePrice: number;
  dropPercentage: number; // e.g., 10 for -10%
  apiKey: string;
  privateKey: string;
}

interface MarketUpdate {
  market_ticker: string;
  yes_price?: number;
  no_price?: number;
  timestamp?: number;
}

export class StopLossManager {
  private activeStopLosses: Map<string, WebSocket> = new Map();
  private discordClient: DiscordClient | null = null;

  setDiscordClient(client: DiscordClient) {
    this.discordClient = client;
  }

  /**
   * Start monitoring a position for stop loss
   */
  startStopLoss(stopLoss: StopLossOrder) {
    const stopLossId = `${stopLoss.userId}-${stopLoss.marketTicker}-${stopLoss.side}`;

    // Stop existing stop loss if running
    if (this.activeStopLosses.has(stopLossId)) {
      const existingWs = this.activeStopLosses.get(stopLossId);
      if (existingWs) existingWs.close();
    }

    const WS_URL = process.env.KALSHI_BASE_URL?.includes('demo')
      ? 'wss://demo-api.kalshi.co/trade-api/ws/v2'
      : 'wss://api.elections.kalshi.com/trade-api/ws/v2';

    console.log(`🛑 Starting stop loss for ${stopLossId}...`);

    try {
      // Generate authentication headers for WebSocket
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = timestamp + 'GET/trade-api/ws/v2';
      
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      const signature = sign.sign({
        key: stopLoss.privateKey,
        format: 'pem',
        type: 'pkcs8',
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      }, 'base64');

      const headers = {
        'KALSHI-ACCESS-KEY': stopLoss.apiKey,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
      };

      const ws = new WebSocket(WS_URL, {
        headers,
      });
      let hasExecuted = false;

      ws.on('open', () => {
        console.log(`✅ WS connected for stop loss ${stopLossId}`);

        // Subscribe to market ticker
        ws.send(
          JSON.stringify({
            id: 1,
            cmd: 'subscribe',
            params: {
              channels: ['market_ticker'],
              market_ticker: stopLoss.marketTicker,
            },
          })
        );
      });

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type !== 'market_ticker') return;

          const data: MarketUpdate = msg.data;

          if (data.market_ticker !== stopLoss.marketTicker) return;

          const currentPrice =
            stopLoss.side === 'yes' ? data.yes_price : data.no_price;

          if (!currentPrice) return;

          // Calculate trigger price (drop by X%)
          const triggerPrice = stopLoss.basePrice * (1 - stopLoss.dropPercentage / 100);
          const dropPercent = ((currentPrice - stopLoss.basePrice) / stopLoss.basePrice * 100).toFixed(2);

          console.log(
            `📊 ${stopLoss.marketTicker} [${stopLoss.side.toUpperCase()}] - Current: $${currentPrice.toFixed(4)}, Trigger: $${triggerPrice.toFixed(4)} (${dropPercent}%)`
          );

          // 🔴 Check if stop loss triggered
          if (currentPrice <= triggerPrice && !hasExecuted) {
            hasExecuted = true;
            console.log(`🛑 STOP LOSS TRIGGERED for ${stopLossId}! Executing sell order...`);

            await this.executeSellOrder(stopLoss, currentPrice, data);
            ws.close();
            this.activeStopLosses.delete(stopLossId);
          }
        } catch (err) {
          console.error('Error processing WS message:', err);
        }
      });

      ws.on('error', (err) => {
        console.error(`❌ WS error for ${stopLossId}:`, err);
      });

      ws.on('close', () => {
        console.log(`🔌 WS closed for ${stopLossId}`);
        this.activeStopLosses.delete(stopLossId);
      });

      this.activeStopLosses.set(stopLossId, ws);
    } catch (err) {
      console.error('Error starting stop loss:', err);
    }
  }

  /**
   * Execute sell order when stop loss triggers
   */
  private async executeSellOrder(
    stopLoss: StopLossOrder,
    currentPrice: number,
    marketData: MarketUpdate
  ) {
    if (!this.discordClient) {
      console.error('Discord client not initialized');
      return;
    }

    try {
      // Step 1: Get current position to know quantity to sell
      console.log(`📍 Fetching position for ${stopLoss.marketTicker}...`);

      const positionsData = await makeSignedGetRequest(
        '/trade-api/v2/portfolio/positions?limit=100',
        stopLoss.apiKey,
        stopLoss.privateKey,
        KALSHI_BASE_URL
      );

      // Find position for this market
      let positionQuantity = 0;
      if (positionsData.market_positions) {
        const position = positionsData.market_positions.find(
          (p: any) => p.ticker === stopLoss.marketTicker
        );
        if (position) {
          positionQuantity = parseFloat(position.position_fp) || 0;
        }
      }

      if (positionQuantity <= 0) {
        console.log(`⚠️ No position found for ${stopLoss.marketTicker}`);
        await this.sendStopLossDM(stopLoss, currentPrice, marketData, null, 'Position not found');
        return;
      }

      // Step 2: Place SELL order (opposite side)
      console.log(
        `📤 Placing SELL order: ${positionQuantity} ${stopLoss.side.toUpperCase()} @ market price...`
      );

      const orderPayload = {
        ticker: stopLoss.marketTicker,
        side: stopLoss.side, // Sell the same side we're holding
        type: 'market', // Market order for fast execution
        quantity: positionQuantity,
      };

      const orderResult = await makeSignedPostRequest(
        '/trade-api/v2/portfolio/orders',
        stopLoss.apiKey,
        stopLoss.privateKey,
        KALSHI_BASE_URL,
        orderPayload
      );

      console.log(`✅ Order executed! Order ID: ${orderResult.order?.order_id}`);

      // Step 3: Send DM with confirmation
      await this.sendStopLossDM(
        stopLoss,
        currentPrice,
        marketData,
        orderResult.order,
        null
      );
    } catch (err) {
      console.error('Error executing stop loss order:', err);
      await this.sendStopLossDM(
        stopLoss,
        currentPrice,
        marketData,
        null,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }

  /**
   * Send stop loss DM to user
   */
  private async sendStopLossDM(
    stopLoss: StopLossOrder,
    currentPrice: number,
    marketData: MarketUpdate,
    order: any,
    errorMessage: string | null
  ) {
    if (!this.discordClient) return;

    try {
      const user = await this.discordClient.users.fetch(stopLoss.userId);

      const priceChange = (
        ((currentPrice - stopLoss.basePrice) / stopLoss.basePrice) *
        100
      ).toFixed(2);

      let title = '🛑 Stop Loss Triggered!';
      let color = 0xff6b6b; // Red

      if (errorMessage) {
        title = '❌ Stop Loss Error';
        color = 0xff4444;
      } else if (order) {
        title = '✅ Position Closed!';
        color = 0x00ff00;
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`**${stopLoss.marketTicker}**\n${stopLoss.side.toUpperCase()} position exited`)
        .addFields(
          {
            name: '📊 Market Ticker',
            value: `\`${stopLoss.marketTicker}\``,
            inline: true,
          },
          {
            name: '📈 Side Held',
            value: stopLoss.side.toUpperCase(),
            inline: true,
          },
          {
            name: '🔴 Stop Loss %',
            value: `\`-${stopLoss.dropPercentage}%\``,
            inline: true,
          },
          {
            name: '💰 Entry Price',
            value: `\`$${stopLoss.basePrice.toFixed(4)}\``,
            inline: true,
          },
          {
            name: '⚡ Trigger Price',
            value: `\`$${(stopLoss.basePrice * (1 - stopLoss.dropPercentage / 100)).toFixed(4)}\``,
            inline: true,
          },
          {
            name: '📉 Current Price',
            value: `\`$${currentPrice.toFixed(4)}\``,
            inline: true,
          },
          {
            name: '📊 Price Change',
            value: `\`${priceChange}%\` 📉`,
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
        );

      if (order) {
        embed.addFields(
          {
            name: '✅ Order Executed',
            value: `Order ID: \`${order.order_id}\``,
            inline: false,
          },
          {
            name: '📈 Quantity Sold',
            value: `\`${order.quantity}\` contracts`,
            inline: true,
          },
          {
            name: '💵 Order Status',
            value: `\`${order.status || 'PENDING'}\``,
            inline: true,
          }
        );
      } else if (errorMessage) {
        embed.addFields({
          name: '❌ Error',
          value: `\`${errorMessage}\``,
          inline: false,
        });
      }

      embed
        .setFooter({
          text: 'Stop loss triggered and position closed',
        })
        .setTimestamp();

      await user.send({ embeds: [embed] });
      console.log(`✅ Stop loss DM sent to user ${stopLoss.userId}`);
    } catch (err) {
      console.error('Error sending stop loss DM:', err);
    }
  }

  /**
   * Stop a stop loss
   */
  stopStopLoss(userId: string, marketTicker: string, side: string) {
    const stopLossId = `${userId}-${marketTicker}-${side}`;
    const ws = this.activeStopLosses.get(stopLossId);

    if (ws) {
      ws.close();
      this.activeStopLosses.delete(stopLossId);
      return true;
    }

    return false;
  }

  /**
   * Get all active stop losses for a user
   */
  getActiveStopLosses(userId: string): string[] {
    return Array.from(this.activeStopLosses.keys()).filter(key =>
      key.startsWith(userId)
    );
  }

  /**
   * Stop all stop losses for a user
   */
  stopAllStopLosses(userId: string) {
    const userStopLosses = this.getActiveStopLosses(userId);
    for (const stopLossId of userStopLosses) {
      const ws = this.activeStopLosses.get(stopLossId);
      if (ws) ws.close();
      this.activeStopLosses.delete(stopLossId);
    }
    return userStopLosses.length;
  }
}

// Export singleton
export const stopLossManager = new StopLossManager();
