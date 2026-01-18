/**
 * /markets command
 * View available Kalshi prediction markets
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { kalshiAPIClient } from '../kalshi-api-client.js';

export const marketsCommand = new SlashCommandBuilder()
  .setName('markets')
  .setDescription('View available Kalshi prediction markets')
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Filter by category (politics, finance, sports, etc.)')
      .setRequired(false)
  );

export async function executeMarkets(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const category = interaction.options.get('category')?.value as string | undefined;

    console.log(`📊 Fetching Kalshi markets${category ? ` (${category})` : ''}...`);

    // Fetch markets from Kalshi API
    const markets = await kalshiAPIClient.getMarkets(
      category ? { category } : undefined
    );

    if (!markets || markets.length === 0) {
      await interaction.editReply({
        content: '📭 No markets found. Try a different category!',
      });
      return;
    }

    // Create embed with markets
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('📊 Kalshi Prediction Markets')
      .setDescription(`Showing ${Math.min(markets.length, 10)} markets`)
      .setFooter({ text: 'Use /bet to place a bet on any market' });

    // Add fields for first 10 markets
    markets.slice(0, 10).forEach((market, index) => {
      const yesPrice = market.yes_price ? `${(market.yes_price * 100).toFixed(1)}%` : 'N/A';
      const noPrice = market.no_price ? `${(market.no_price * 100).toFixed(1)}%` : 'N/A';

      embed.addFields({
        name: `${index + 1}. ${market.title}`,
        value: `Ticker: \`${market.event_ticker}\`\nYES: ${yesPrice} | NO: ${noPrice}`,
        inline: false,
      });
    });

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`✅ Displayed ${Math.min(markets.length, 10)} markets to ${interaction.user.username}`);
  } catch (error) {
    console.error('Error in /markets command:', error);
    await interaction.editReply({
      content: '❌ Failed to fetch markets. Please try again later.',
    });
  }
}
