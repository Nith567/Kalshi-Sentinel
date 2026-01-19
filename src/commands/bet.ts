/**
 * /bet command
 * Place a bet on a Kalshi market
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { kalshiUserManager } from '../kalshi-user-manager.js';

dotenv.config();

const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://demo-api.kalshi.co';

export const betCommand = new SlashCommandBuilder()
  .setName('bet')
  .setDescription('Place a bet on a Kalshi market')
  .addStringOption(option =>
    option
      .setName('ticker')
      .setDescription('Market ticker (e.g., ASGELECT25JAN)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('side')
      .setDescription('YES or NO')
      .addChoices(
        { name: 'YES', value: 'yes' },
        { name: 'NO', value: 'no' }
      )
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('action')
      .setDescription('BUY or SELL')
      .addChoices(
        { name: 'BUY', value: 'buy' },
        { name: 'SELL', value: 'sell' }
      )
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('Number of contracts to trade')
      .setRequired(true)
      .setMinValue(1)
  )
  .addIntegerOption(option =>
    option
      .setName('price')
      .setDescription('Price in cents (1-99, where 50 = $0.50)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(99)
  );

export async function executeBet(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    // Get command parameters
    const ticker = interaction.options.getString('ticker')!;
    const side = interaction.options.getString('side')!; // 'yes' or 'no'
    const action = interaction.options.getString('action')!; // 'buy' or 'sell'
    const count = interaction.options.getInteger('count')!;
    const price = interaction.options.getInteger('price')!;

    console.log(`🎲 ${username} placing bet: ${action} ${count} contracts ${side} @ $0.${price.toString().padStart(2, '0')} on ${ticker}`);

    // Step 1: Get user's Kalshi account (with decrypted credentials)
    const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

    if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
      await interaction.editReply({
        content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
      });
      return;
    }

    // Step 2: Sign request with private key
    const method = 'POST';
    const baseUrl = KALSHI_BASE_URL;
    const apiPath = '/trade-api/v2/portfolio/orders';
    const currentTimeMilliseconds = Date.now();
    const timestampStr = currentTimeMilliseconds.toString();

    // Create request body
    const requestBody = {
      ticker,
      side,
      action,
      count,
      type: 'limit',
      yes_price: side === 'yes' ? price : (100 - price),
      no_price: side === 'no' ? price : (100 - price),
    };

    // Sign the request (POST requires body in signature)
    const pathWithoutQuery = apiPath.split('?')[0];
    const bodyString = JSON.stringify(requestBody);
    const msgString = timestampStr + method + pathWithoutQuery + bodyString;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(msgString);
    sign.end();

    const signature = sign.sign({
      key: kalshiUser.kalshi_private_key,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    const signatureBase64 = signature.toString('base64');

    // Step 3: Place order with signed request
    const headers = {
      'Content-Type': 'application/json',
      'KALSHI-ACCESS-KEY': kalshiUser.kalshi_api_key,
      'KALSHI-ACCESS-SIGNATURE': signatureBase64,
      'KALSHI-ACCESS-TIMESTAMP': timestampStr,
    };

    const response = await axios.post(baseUrl + apiPath, requestBody, { headers });
    const orderResult = response.data;

    if (!orderResult || !orderResult.order) {
      await interaction.editReply({
        content: '❌ Failed to place order. Please try again.',
      });
      return;
    }

    // Step 4: Clear sensitive data from memory
    delete (kalshiUser as any).kalshi_private_key;
    delete (kalshiUser as any).kalshi_api_key;

    // Step 5: Create success embed
    const order = orderResult.order;
    const priceDisplay = `$0.${price.toString().padStart(2, '0')}`;

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Order Placed Successfully')
      .setDescription(`Logged in as **${kalshiUser.kalshi_username}**`)
      .addFields(
        { name: '📊 Market', value: `\`${order.ticker}\``, inline: true },
        { name: '🎯 Side', value: order.side.toUpperCase(), inline: true },
        { name: '� Action', value: order.action.toUpperCase(), inline: true },
        { name: '� Contracts', value: `${order.remaining_count_fp}`, inline: true },
        { name: '� Price', value: priceDisplay, inline: true },
        { name: '⏱️ Status', value: order.status, inline: true },
        { name: '📍 Order ID', value: `\`${order.order_id}\``, inline: false }
      )
      .setFooter({ text: 'Private key was used only for this order and is no longer in memory' });

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`✅ Order placed for ${username}: ${order.order_id}`);

  } catch (error: any) {
    console.error('Error in /bet command:', error);
    
    let errorMessage = '❌ Failed to place order. Please try again.';
    
    if (error.response?.data?.message) {
      errorMessage = `❌ ${error.response.data.message}`;
    } else if (error.message) {
      errorMessage = `❌ ${error.message}`;
    }

    await interaction.editReply({
      content: errorMessage,
    });
  }
}
