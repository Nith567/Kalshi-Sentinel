/**
 * /stoploss command
 * Set up automatic stop loss orders
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import * as dotenv from 'dotenv';
import { kalshiUserManager } from '../kalshi-user-manager.js';
import { stopLossManager } from '../stoploss-manager.js';

dotenv.config();

export const stoplossCommand = new SlashCommandBuilder()
  .setName('stoploss')
  .setDescription('Set up automatic stop loss orders')
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Create a stop loss order')
      .addStringOption(option =>
        option
          .setName('ticker')
          .setDescription('Market ticker (e.g., KXKHAMENEIOUT-AKHA-26SEP01)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('side')
          .setDescription('Which side you hold: YES or NO')
          .addChoices(
            { name: 'YES', value: 'yes' },
            { name: 'NO', value: 'no' }
          )
          .setRequired(true)
      )
      .addNumberOption(option =>
        option
          .setName('drop_percentage')
          .setDescription('Exit if price drops by X% (e.g., 10 for -10%)')
          .setMinValue(0.1)
          .setMaxValue(100)
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('View all your active stop losses')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Cancel a stop loss order')
      .addStringOption(option =>
        option
          .setName('ticker')
          .setDescription('Market ticker to cancel')
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

export async function executeStopLoss(interaction: CommandInteraction) {
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
      await handleSetStopLoss(interaction, userId);
    } else if (subcommand === 'list') {
      await handleListStopLosses(interaction, userId);
    } else if (subcommand === 'stop') {
      await handleStopStopLoss(interaction, userId);
    }
  } catch (error) {
    console.error('Error in stoploss command:', error);
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

async function handleSetStopLoss(
  interaction: CommandInteraction,
  userId: string
) {
  const ticker = ((interaction.options as any).getString('ticker') || '').toUpperCase();
  const side = ((interaction.options as any).getString('side') || 'yes') as 'yes' | 'no';
  const dropPercentage = (interaction.options as any).getNumber('drop_percentage') || 10;

  // Get user's Kalshi account
  const kalshiUser = await kalshiUserManager.getKalshiUser(userId);

  if (!kalshiUser || !kalshiUser.kalshi_api_key || !kalshiUser.kalshi_private_key) {
    return await interaction.editReply({
      content: '❌ **No Kalshi Account Linked**\n\nUse `/link` to connect your Kalshi account first!',
    });
  }

  // Get base price from current position (we'll use a default for now)
  // In production, fetch actual position price
  const basePrice = 0.50;

  // Start the stop loss
  stopLossManager.startStopLoss({
    userId,
    marketTicker: ticker,
    side,
    basePrice,
    dropPercentage,
    apiKey: kalshiUser.kalshi_api_key,
    privateKey: kalshiUser.kalshi_private_key,
  });

  const triggerPrice = (basePrice * (1 - dropPercentage / 100)).toFixed(4);

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('🛑 Stop Loss Set!')
    .setDescription(`Auto-exit order ready for **${ticker}**`)
    .addFields(
      {
        name: '📊 Market Ticker',
        value: `\`${ticker}\``,
        inline: true,
      },
      {
        name: '📈 Side Held',
        value: side.toUpperCase(),
        inline: true,
      },
      {
        name: '🔴 Drop Threshold',
        value: `\`-${dropPercentage}%\``,
        inline: true,
      },
      {
        name: '💰 Entry Price',
        value: `\`$${basePrice.toFixed(4)}\``,
        inline: true,
      },
      {
        name: '⚡ Trigger Price',
        value: `\`$${triggerPrice}\``,
        inline: true,
      },
      {
        name: '🤖 Auto-Execution',
        value: 'Market SELL order when triggered',
        inline: true,
      },
      {
        name: '📋 What happens',
        value: `When ${side.toUpperCase()} price drops to $${triggerPrice}:\n✅ Bot automatically sells your position\n✅ You get a DM with order confirmation\n✅ Stop loss closes`,
        inline: false,
      }
    )
    .setFooter({
      text: 'Use /stoploss list to see all active stop losses',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleListStopLosses(
  interaction: CommandInteraction,
  userId: string
) {
  const activeStopLosses = stopLossManager.getActiveStopLosses(userId);

  if (activeStopLosses.length === 0) {
    return await interaction.editReply({
      content: '🛑 **No active stop losses!** Use `/stoploss set` to create one.',
    });
  }

  let description = '';
  for (const stopLossId of activeStopLosses) {
    const [, ticker, side] = stopLossId.split('-');
    description += `\n🛑 \`${ticker}\` (${side.toUpperCase()})`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('🛑 Active Stop Losses')
    .setDescription(description.trim())
    .addFields({
      name: '📊 Total Active',
      value: `\`${activeStopLosses.length}\``,
      inline: false,
    })
    .setFooter({
      text: 'Use /stoploss stop <ticker> <side> to cancel',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleStopStopLoss(
  interaction: CommandInteraction,
  userId: string
) {
  const ticker = ((interaction.options as any).getString('ticker') || '').toUpperCase();
  const side = ((interaction.options as any).getString('side') || 'yes') as 'yes' | 'no';

  const stopped = stopLossManager.stopStopLoss(userId, ticker, side);

  if (!stopped) {
    return await interaction.editReply({
      content: `❌ **Stop loss not found!** No active stop loss for \`${ticker}\` (${side.toUpperCase()})`,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x888888)
    .setTitle('🛑 Stop Loss Cancelled')
    .setDescription(`Stopped monitoring **${ticker}** (${side.toUpperCase()})`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
