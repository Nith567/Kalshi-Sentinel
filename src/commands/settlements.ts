/**
 * /settlements command
 * Display user's settled positions with pagination
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

export const settlementsCommand = new SlashCommandBuilder()
  .setName('settlements')
  .setDescription('View your settled positions')
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Number of settlements to show (max 100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(false)
  );

export async function executeSettlements(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const limit = (interaction.options as any).getInteger('limit') || 20;

  try {
    console.log(`📊 ${username} viewing settlements...`);

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
    const apiPath = `/trade-api/v2/portfolio/settlements?limit=${limit}`;
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

    // Fetch settlements
    const headers = {
      'KALSHI-ACCESS-KEY': kalshiUser.kalshi_api_key,
      'KALSHI-ACCESS-SIGNATURE': signatureBase64,
      'KALSHI-ACCESS-TIMESTAMP': timestampStr,
    };

    const response = await axios.get(KALSHI_BASE_URL + apiPath, { headers });
    const data = response.data;

    if (!data.settlements || data.settlements.length === 0) {
      await interaction.editReply({
        content: '📊 **No settlements found!** You haven\'t settled any positions yet.',
      });
      return;
    }

    // Format settlements
    const settlements = data.settlements.slice(0, 10);
    let description = '';

    for (const settlement of settlements) {
      const marketResult = settlement.market_result.toUpperCase();
      const value = (settlement.value / 100).toFixed(2);
      const fee = parseFloat(settlement.fee_cost).toFixed(2);
      const resultCount = settlement.market_result === 'yes' 
        ? settlement.yes_count 
        : settlement.no_count;

      description += `
**${settlement.ticker}** | \`${settlement.event_ticker}\`
├─ Market Result: **${marketResult}** ✓
├─ Your Shares: **${resultCount}**
├─ PnL: \`$${value}\`
├─ Fees: \`$${fee}\`
└─ Settled: <t:${Math.floor(new Date(settlement.settled_time).getTime() / 1000)}:R>
`;
    }

    // Calculate totals
    const totalValue = data.settlements.reduce((sum: number, s: any) => sum + s.value, 0);
    const totalFees = data.settlements.reduce(
      (sum: number, s: any) => sum + parseFloat(s.fee_cost),
      0
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('💰 Settlement History')
      .setDescription(description.trim() || 'No settlements to display')
      .addFields(
        {
          name: '📈 Total PnL',
          value: `\`$${(totalValue / 100).toFixed(2)}\``,
          inline: true,
        },
        {
          name: '💸 Total Fees',
          value: `\`$${totalFees.toFixed(2)}\``,
          inline: true,
        },
        {
          name: '📊 Positions Settled',
          value: `\`${data.settlements.length}\``,
          inline: true,
        }
      )
      .setFooter({
        text: data.cursor
          ? `📄 More settlements available (cursor for pagination)`
          : 'All settlements shown',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error fetching settlements:', error);
    await interaction.editReply(
      `❌ **Error fetching settlements!**\n\`\`\`${error instanceof Error ? error.message : 'Unknown error'}\`\`\``
    );
  }
}
