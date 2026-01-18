/**
 * /portfolio command
 * View your Kalshi portfolio
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

export const portfolioCommand = new SlashCommandBuilder()
  .setName('portfolio')
  .setDescription('View your Kalshi portfolio');

export async function executePortfolio(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    console.log(`📈 ${username} checking portfolio...`);

    // Step 1: Get user's Kalshi account (with decrypted credentials)
    const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

    if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
      await interaction.editReply({
        content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
      });
      return;
    }

    // Step 2: Sign request with private key
    const method = 'GET';
    const baseUrl = KALSHI_BASE_URL;
    const apiPath = '/trade-api/v2/portfolio/balance';
    const currentTimeMilliseconds = Date.now();
    const timestampStr = currentTimeMilliseconds.toString();

    // Sign the request
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

    // Step 3: Fetch balance with signed request
    const headers = {
      'KALSHI-ACCESS-KEY': kalshiUser.kalshi_api_key,
      'KALSHI-ACCESS-SIGNATURE': signatureBase64,
      'KALSHI-ACCESS-TIMESTAMP': timestampStr,
    };

    const response = await axios.get(baseUrl + apiPath, { headers });
    const portfolio = response.data;

    if (!portfolio || !portfolio.balance) {
      await interaction.editReply({
        content: '❌ Failed to fetch portfolio. Please try again.',
      });
      return;
    }

    // Step 4: Clear sensitive data from memory
    delete (kalshiUser as any).kalshi_private_key;
    delete (kalshiUser as any).kalshi_api_key;

    // Step 5: Create portfolio embed
    const balanceDollars = portfolio.balance / 100;
    const portfolioValueDollars = portfolio.portfolio_value / 100;
    const totalValue = balanceDollars + portfolioValueDollars;

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📈 Your Kalshi Portfolio')
      .setDescription(`Logged in as **${kalshiUser.kalshi_username}**`)
      .addFields(
        { name: '💰 Available Balance', value: `$${balanceDollars.toFixed(2)}`, inline: true },
        { name: '📊 Portfolio Value', value: `$${portfolioValueDollars.toFixed(2)}`, inline: true },
        { name: '💎 Total Value', value: `$${totalValue.toFixed(2)}`, inline: true }
      )
      .setFooter({ text: 'Use /bet to place new bets' });

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`✅ Portfolio displayed for ${username}`);

  } catch (error) {
    console.error('Error in /portfolio command:', error);
    await interaction.editReply({
      content: '❌ Failed to fetch portfolio. Please try again.',
    });
  }
}
