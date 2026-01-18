/**
 * /alert command
 * Set up price alerts for markets
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import * as dotenv from 'dotenv';
import { kalshiUserManager } from '../kalshi-user-manager.js';
import { alertManager } from '../alert-manager.js';

dotenv.config();

export const alertCommand = new SlashCommandBuilder()
  .setName('alert')
  .setDescription('Set up price alerts for markets')
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set a new price alert')
      .addStringOption(option =>
        option
          .setName('ticker')
          .setDescription('Market ticker (e.g., KXKHAMENEIOUT-AKHA-26SEP01)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('side')
          .setDescription('Which side to monitor: YES or NO')
          .addChoices(
            { name: 'YES', value: 'yes' },
            { name: 'NO', value: 'no' }
          )
          .setRequired(true)
      )
      .addNumberOption(option =>
        option
          .setName('percentage')
          .setDescription('Price increase threshold in % (e.g., 10 for +10%)')
          .setMinValue(0.1)
          .setMaxValue(100)
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('View all your active alerts')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Stop an active alert')
      .addStringOption(option =>
        option
          .setName('ticker')
          .setDescription('Market ticker to stop monitoring')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('side')
          .setDescription('Which side (YES or NO)')
          .addChoices(
            { name: 'YES', value: 'yes' },
            { name: 'NO', value: 'no' }
          )
          .setRequired(true)
      )
  );

export async function executeAlert(interaction: CommandInteraction) {
  const subcommand = (interaction.options as any).getSubcommand();
  const userId = interaction.user.id;

  try {
    // Reply immediately to prevent Discord timeout (3 second window)
    try {
      if (!interaction.replied) {
        await interaction.reply({
          content: '⏳ Processing...',
          ephemeral: true,
        });
      }
    } catch (replyErr) {
      console.error('Failed to reply to interaction:', replyErr);
      return; // Exit if we can't reply
    }

    if (subcommand === 'set') {
      await handleSetAlert(interaction, userId);
    } else if (subcommand === 'list') {
      await handleListAlerts(interaction, userId);
    } else if (subcommand === 'stop') {
      await handleStopAlert(interaction, userId);
    }
  } catch (error) {
    console.error('Error in alert command:', error);
    // Only try to edit if we have a valid interaction
    if (interaction.replied) {
      try {
        await interaction.editReply({
          content: `❌ **Error!** ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } catch (e) {
        console.error('Failed to edit reply:', e);
      }
    }
  }
}

async function handleSetAlert(
  interaction: CommandInteraction,
  userId: string
) {
  const ticker = ((interaction.options as any).getString('ticker') || '').toUpperCase();
  const side = ((interaction.options as any).getString('side') || 'yes') as 'yes' | 'no';
  const percentage = (interaction.options as any).getNumber('percentage') || 10;

  // Get user's Kalshi account
  const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

  if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
    return await interaction.editReply({
      content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
    });
  }

  // Get current price from position
  // For now, we'll use a placeholder - in real usage, fetch from API
  const basePrice = 0.50; // Default entry price

  // Start the alert
  alertManager.startAlert({
    userId,
    marketTicker: ticker,
    side,
    basePrice,
    percentageThreshold: percentage,
    apiKey: kalshiUser.kalshi_api_key,
    privateKey: kalshiUser.kalshi_private_key,
  });

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Alert Set Successfully!')
    .setDescription(`Monitoring **${ticker}** for ${side.toUpperCase()} price changes`)
    .addFields(
      {
        name: '📊 Market Ticker',
        value: `\`${ticker}\``,
        inline: true,
      },
      {
        name: '📈 Side',
        value: side.toUpperCase(),
        inline: true,
      },
      {
        name: '🔥 Threshold',
        value: `\`+${percentage}%\``,
        inline: true,
      },
      {
        name: '📍 Base Price',
        value: `\`$${basePrice.toFixed(4)}\``,
        inline: true,
      },
      {
        name: '⚡ Trigger Price',
        value: `\`$${(basePrice * (1 + percentage / 100)).toFixed(4)}\``,
        inline: true,
      },
      {
        name: '💬 Notification',
        value: 'You\'ll receive a DM when price reaches the threshold',
        inline: false,
      }
    )
    .setFooter({
      text: 'Use /alert list to see all active alerts',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleListAlerts(
  interaction: CommandInteraction,
  userId: string
) {
  const activeAlerts = alertManager.getActiveAlerts(userId);

  if (activeAlerts.length === 0) {
    return await interaction.editReply({
      content: '📊 **No active alerts!** Use `/alert set` to create one.',
    });
  }

  let description = '';
  for (const alertId of activeAlerts) {
    const [, ticker, side] = alertId.split('-');
    description += `\n✅ \`${ticker}\` (${side.toUpperCase()})`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📢 Your Active Alerts')
    .setDescription(description.trim())
    .addFields({
      name: '🎯 Total Active',
      value: `\`${activeAlerts.length}\``,
      inline: false,
    })
    .setFooter({
      text: 'Use /alert stop <ticker> <side> to remove an alert',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleStopAlert(
  interaction: CommandInteraction,
  userId: string
) {
  const ticker = ((interaction.options as any).getString('ticker') || '').toUpperCase();
  const side = ((interaction.options as any).getString('side') || 'yes') as 'yes' | 'no';

  const stopped = alertManager.stopAlert(userId, ticker, side);

  if (!stopped) {
    return await interaction.editReply({
      content: `❌ **Alert not found!** No active alert for \`${ticker}\` (${side.toUpperCase()})`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('🛑 Alert Stopped')
    .setDescription(`Stopped monitoring **${ticker}** for ${side.toUpperCase()} price changes`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
