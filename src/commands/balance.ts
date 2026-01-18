/**
 * /balance command
 * Check your Kalshi account balance
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import * as dotenv from 'dotenv';
import { kalshiUserManager } from '../kalshi-user-manager.js';
import { makeSignedGetRequest } from '../kalshi-request-signer.js';

dotenv.config();

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';

export const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your Kalshi account balance');

export async function executeBalance(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    console.log(`💰 ${username} checking balance...`);

    // Step 1: Get user's Kalshi account (with decrypted credentials)
    const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

    if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
      await interaction.editReply({
        content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
      });
      return;
    }

    // Step 2: Sign request and fetch balance
    const method = 'GET';
    const apiPath = '/trade-api/v2/portfolio/balance';

    // Use the signed request signer
    const balanceData = await makeSignedGetRequest(
      apiPath,
      kalshiUser.kalshi_api_key,
      kalshiUser.kalshi_private_key,
      KALSHI_BASE_URL
    );

    if (!balanceData || balanceData.balance === undefined) {
      await interaction.editReply({
        content: '❌ Failed to fetch balance. Please try again.',
      });
      return;
    }

    // Step 4: Clear sensitive data from memory
    delete (kalshiUser as any).kalshi_private_key;
    delete (kalshiUser as any).kalshi_api_key;

    // Step 5: Create balance embed
    const balanceDollars = balanceData.balance / 100;
    const portfolioValueDollars = balanceData.portfolio_value / 100;
    const totalValue = balanceDollars + portfolioValueDollars;

    const embed = new EmbedBuilder()
      .setColor(0x00AA00)
      .setTitle('💰 Your Kalshi Balance')
      .setDescription(`Logged in as **${kalshiUser.kalshi_username}**`)
      .addFields(
        { name: '💵 Available Balance', value: `$${balanceDollars.toFixed(2)}`, inline: true },
        { name: '📈 Portfolio Value', value: `$${portfolioValueDollars.toFixed(2)}`, inline: true },
        { name: '💎 Total Value', value: `$${totalValue.toFixed(2)}`, inline: true }
      )
      .setFooter({ text: 'Use /bet to place new bets' });

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`✅ Balance displayed for ${username}`);

  } catch (error) {
    console.error('Error in /balance command:', error);
    await interaction.editReply({
      content: '❌ Failed to fetch balance. Please try again.',
    });
  }
}
