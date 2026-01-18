/**
 * WebSocket Alert Manager
 * Monitor market prices and alert users when thresholds are triggered
 */

import WebSocket from 'ws';
import { Client as DiscordClient, TextChannel } from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';

export interface PositionAlert {
  discordId: string;
  marketTicker: string;
  side: 'yes' | 'no';
  basePrice: number;
  threshold: number; // 0.10 = 10%
  contractsHeld: number;
  apiKey: string;
  privateKey: string;
}

interface MarketUpdate {
  market_ticker: string;
  yes_price: number;
  no_price: number;
}

interface MarketTickerInfo {
  ticker: string;
  title: string;
  event_ticker: string;
  status: string;
  yes_price: number;
  no_price: number;
}

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';
const WS_URL = `${KALSHI_BASE_URL.replace('https://', 'wss://')}/trade-api/ws/v2`;

const activeAlerts = new Map<string, WebSocket>();

/**
 * Fetch market info via signed API request
 */
async function fetchMarketInfo(
  ticker: string,
  apiKey: string,
  privateKey: string
): Promise<MarketTickerInfo | null> {
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
    const market = response.data.market;

    if (market) {
      return {
        ticker: market.ticker || ticker,
        title: market.title || 'Unknown Market',
        event_ticker: market.event_ticker || 'N/A',
        status: market.status || 'UNKNOWN',
        yes_price: market.yes_price || 0,
        no_price: market.no_price || 0,
      };
    }
  } catch (error) {
    console.error(`Error fetching market info for ${ticker}:`, error);
  }
  return null;
}

/**
 * Start WebSocket alert for a position
 */
export function startPositionAlert(
  alert: PositionAlert,
  discordClient: DiscordClient
): void {
  const alertKey = `${alert.discordId}-${alert.marketTicker}`;

  // Prevent duplicate alerts
  if (activeAlerts.has(alertKey)) {
    console.log(`⚠️ Alert already active for ${alertKey}`);
    return;
  }

  const ws = new WebSocket(WS_URL);
  let hasTriggered = false;

  ws.on('open', () => {
    console.log(`✅ WebSocket connected for ${alert.marketTicker}`);

    // Subscribe to market ticker updates
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

      const currentPrice = alert.side === 'yes' ? data.yes_price : data.no_price;
      const triggerPrice = alert.basePrice * (1 + alert.threshold);

      console.log(
        `📊 ${alert.marketTicker} [${alert.side.toUpperCase()}] - Current: $${currentPrice.toFixed(4)}, Trigger: $${triggerPrice.toFixed(4)}`
      );

      // 🔥 TRIGGER ALERT
      if (currentPrice >= triggerPrice && !hasTriggered) {
        hasTriggered = true;
        console.log(`🚨 ALERT TRIGGERED for ${alert.marketTicker}`);

        // Fetch market info
        const marketInfo = await fetchMarketInfo(
          alert.marketTicker,
          alert.apiKey,
          alert.privateKey
        );

        // Send DM to user
        try {
          const user = await discordClient.users.fetch(alert.discordId);
          const priceChangePercent = ((currentPrice - alert.basePrice) / alert.basePrice * 100).toFixed(2);
          const emoji = alert.side === 'yes' ? '📈' : '📉';

          let dmMessage = `
${emoji} **PRICE ALERT TRIGGERED!**

**Market:** ${marketInfo?.title || alert.marketTicker}
**Ticker:** \`${alert.marketTicker}\`
**Event:** \`${marketInfo?.event_ticker || 'N/A'}\`

**Your Position:**
├─ Side: **${alert.side.toUpperCase()}**
├─ Contracts Held: **${alert.contractsHeld}**
├─ Entry Price: \`$${alert.basePrice.toFixed(4)}\`
└─ Alert Threshold: **+${(alert.threshold * 100).toFixed(0)}%**

**Market Update:**
├─ Current ${alert.side.toUpperCase()} Price: \`$${currentPrice.toFixed(4)}\`
├─ Current NO Price: \`$${data.no_price.toFixed(4)}\`
├─ Price Change: **${priceChangePercent}%** 🔥
└─ Market Status: \`${marketInfo?.status || 'UNKNOWN'}\`

**Action:** Check your positions and consider taking profit!
          `.trim();

          await user.send(dmMessage);
          console.log(`✅ DM sent to user ${alert.discordId}`);
        } catch (dmError) {
          console.error(`Failed to send DM to user:`, dmError);
        }

        // Close WebSocket after alert
        ws.close();
        activeAlerts.delete(alertKey);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ WebSocket error for ${alert.marketTicker}:`, err);
  });

  ws.on('close', () => {
    console.log(`🔌 WebSocket closed for ${alert.marketTicker}`);
    activeAlerts.delete(alertKey);
  });

  // Store active alert
  activeAlerts.set(alertKey, ws);
}

/**
 * Stop alert for a specific position
 */
export function stopPositionAlert(discordId: string, marketTicker: string): boolean {
  const alertKey = `${discordId}-${marketTicker}`;
  const ws = activeAlerts.get(alertKey);

  if (ws) {
    ws.close();
    activeAlerts.delete(alertKey);
    console.log(`✅ Stopped alert for ${alertKey}`);
    return true;
  }

  console.log(`⚠️ No active alert found for ${alertKey}`);
  return false;
}

/**
 * Stop all alerts for a user
 */
export function stopAllAlertsForUser(discordId: string): number {
  let count = 0;
  for (const [alertKey, ws] of activeAlerts.entries()) {
    if (alertKey.startsWith(discordId)) {
      ws.close();
      activeAlerts.delete(alertKey);
      count++;
    }
  }
  console.log(`✅ Stopped ${count} alerts for user ${discordId}`);
  return count;
}

/**
 * Get all active alerts
 */
export function getActiveAlerts(): string[] {
  return Array.from(activeAlerts.keys());
}
