/**
 * /positions command
 * Display user's current open positions (both market and event positions)
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { kalshiUserManager } from '../kalshi-user-manager.js';

dotenv.config();

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';

export const positionsCommand = new SlashCommandBuilder()
  .setName('positions')
  .setDescription('View your current open positions')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Position type to display')
      .addChoices(
        { name: 'Markets', value: 'markets' },
        { name: 'Events', value: 'events' },
        { name: 'All', value: 'all' }
      )
      .setRequired(false)
  );

export async function executePositions(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const positionType = ((interaction.options as any).getString('type') || 'all').toLowerCase();

  try {
    console.log(`📈 ${username} viewing positions (${positionType})...`);

    // Get user's Kalshi account (with decrypted credentials)
    const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

    if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
      await interaction.editReply({
        content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
      });
      return;
    }

    // Sign request
    const method = 'GET';
    const apiPath = '/trade-api/v2/portfolio/positions?limit=100';
    const currentTimeMilliseconds = Date.now();
    const timestampStr = currentTimeMilliseconds.toString();

    const pathWithoutQuery = apiPath.split('?')[0];
    const msgString = timestampStr + method + pathWithoutQuery;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(msgString);
    sign.end();

    const signature = sign.sign({
      key: kalshiUser.kalshi_private_key,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    const signatureBase64 = signature.toString('base64');

    // Fetch positions
    const headers = {
      'KALSHI-ACCESS-KEY': kalshiUser.kalshi_api_key,
      'KALSHI-ACCESS-SIGNATURE': signatureBase64,
      'KALSHI-ACCESS-TIMESTAMP': timestampStr,
    };

    const response = await axios.get(KALSHI_BASE_URL + apiPath, { headers });
    const data = response.data;

    let embeds: EmbedBuilder[] = [];

    // Market Positions
    if ((positionType === 'markets' || positionType === 'all') && data.market_positions && data.market_positions.length > 0) {
      const marketPositions = data.market_positions.slice(0, 15);
      let marketDescription = '';

      for (const pos of marketPositions) {
        const exposure = (parseFloat(pos.market_exposure_dollars) || 0).toFixed(2);
        const pnl = (parseFloat(pos.realized_pnl_dollars) || 0).toFixed(2);
        const pnlEmoji = parseFloat(pnl) >= 0 ? '📈' : '📉';
        const positionSize = (parseFloat(pos.position_fp) || 0).toFixed(2);

        // Fetch market info internally
        let marketTitle = 'N/A';
        let marketStatus = 'UNKNOWN';
        let yesPrice = 'N/A';
        let noPrice = 'N/A';

        try {
          const marketApiPath = `/trade-api/v2/markets/${pos.ticker}`;
          const marketSign = crypto.createSign('RSA-SHA256');
          marketSign.update(timestampStr + 'GET' + marketApiPath);
          marketSign.end();

          const marketSignature = marketSign.sign({
            key: kalshiUser.kalshi_private_key,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          });

          const marketHeaders = {
            'KALSHI-ACCESS-KEY': kalshiUser.kalshi_api_key,
            'KALSHI-ACCESS-SIGNATURE': marketSignature.toString('base64'),
            'KALSHI-ACCESS-TIMESTAMP': timestampStr,
          };

          const marketResponse = await axios.get(KALSHI_BASE_URL + marketApiPath, { headers: marketHeaders });
          const market = marketResponse.data.market;

          if (market) {
            marketTitle = market.title || 'N/A';
            marketStatus = market.status || 'UNKNOWN';
            yesPrice = market.yes_price ? `$${market.yes_price.toFixed(2)}` : 'N/A';
            noPrice = market.no_price ? `$${market.no_price.toFixed(2)}` : 'N/A';
          }
        } catch (err) {
          // Silently fail, use defaults
          console.log(`Could not fetch market details for ${pos.ticker}`);
        }

        marketDescription += `
**${pos.ticker}**
📝 *${marketTitle}*
├─ Position: **${positionSize}** shares
├─ 💰 YES Price: \`${yesPrice}\` | 🚫 NO Price: \`${noPrice}\`
├─ Exposure: \`$${exposure}\`
├─ PnL: ${pnlEmoji} \`$${pnl}\`
├─ Status: \`${marketStatus}\`
├─ Orders: **${pos.resting_orders_count}**
└─ Fees Paid: \`$${(parseFloat(pos.fees_paid_dollars) || 0).toFixed(2)}\`

🔔 Use \`/alert set ${pos.ticker} yes <percentage>\` to get price alerts
`;
      }

      const marketTotalExposure = data.market_positions.reduce((sum: number, p: any) => 
        sum + (parseFloat(p.market_exposure_dollars) || 0), 0
      );
      const marketTotalPnL = data.market_positions.reduce((sum: number, p: any) => 
        sum + (parseFloat(p.realized_pnl_dollars) || 0), 0
      );

      const marketEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('📊 Market Positions')
        .setDescription(marketDescription.trim() || 'No market positions')
        .addFields(
          {
            name: '💰 Total Exposure',
            value: `\`$${marketTotalExposure.toFixed(2)}\``,
            inline: true,
          },
          {
            name: marketTotalPnL >= 0 ? '📈 Total PnL' : '📉 Total PnL',
            value: `\`$${marketTotalPnL.toFixed(2)}\``,
            inline: true,
          },
          {
            name: '📍 Active Markets',
            value: `\`${data.market_positions.length}\``,
            inline: true,
          }
        );

      embeds.push(marketEmbed);
    }

    // Event Positions
    if ((positionType === 'events' || positionType === 'all') && data.event_positions && data.event_positions.length > 0) {
      const eventPositions = data.event_positions.slice(0, 15);
      let eventDescription = '';

      for (const pos of eventPositions) {
        const exposure = (parseFloat(pos.event_exposure_dollars) || 0).toFixed(2);
        const pnl = (parseFloat(pos.realized_pnl_dollars) || 0).toFixed(2);
        const pnlEmoji = parseFloat(pnl) >= 0 ? '📈' : '📉';
        const totalCost = (parseFloat(pos.total_cost_dollars) || 0).toFixed(2);

        eventDescription += `
**${pos.event_ticker}**
├─ Total Cost: \`$${totalCost}\`
├─ Exposure: \`$${exposure}\`
├─ PnL: ${pnlEmoji} \`$${pnl}\`
└─ Fees Paid: \`$${(parseFloat(pos.fees_paid_dollars) || 0).toFixed(2)}\`
`;
      }

      const eventTotalExposure = data.event_positions.reduce((sum: number, p: any) => 
        sum + (parseFloat(p.event_exposure_dollars) || 0), 0
      );
      const eventTotalPnL = data.event_positions.reduce((sum: number, p: any) => 
        sum + (parseFloat(p.realized_pnl_dollars) || 0), 0
      );

      const eventEmbed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎯 Event Positions')
        .setDescription(eventDescription.trim() || 'No event positions')
        .addFields(
          {
            name: '💰 Total Exposure',
            value: `\`$${eventTotalExposure.toFixed(2)}\``,
            inline: true,
          },
          {
            name: eventTotalPnL >= 0 ? '📈 Total PnL' : '📉 Total PnL',
            value: `\`$${eventTotalPnL.toFixed(2)}\``,
            inline: true,
          },
          {
            name: '🎯 Active Events',
            value: `\`${data.event_positions.length}\``,
            inline: true,
          }
        );

      embeds.push(eventEmbed);
    }

    // No positions at all
    if (embeds.length === 0) {
      await interaction.editReply({
        content: '📊 **No open positions!** Start trading with `/bet` to create positions.',
      });
      return;
    }

    // Set footer to last embed
    if (embeds.length > 0) {
      embeds[embeds.length - 1].setFooter({
        text: 'Use /bet to open new positions',
      }).setTimestamp();
    }

    await interaction.editReply({ embeds });
  } catch (error) {
    console.error('Error fetching positions:', error);
    await interaction.editReply(
      `❌ **Error fetching positions!**\n\`\`\`${error instanceof Error ? error.message : 'Unknown error'}\`\`\``
    );
  }
}
