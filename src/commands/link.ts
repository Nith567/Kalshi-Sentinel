/**
 * /link command
 * Link Kalshi account to Discord user (API Key + Private Key)
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { kalshiUserManager } from '../kalshi-user-manager.js';

export const linkCommand = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Kalshi account to Discord');

export async function executeLink(interaction: CommandInteraction) {
  // Create modal for user to input Kalshi credentials
  const modal = new ModalBuilder()
    .setCustomId('kalshi_link_modal')
    .setTitle('Link Kalshi Account');

  const apiKeyInput = new TextInputBuilder()
    .setCustomId('kalshi_api_key')
    .setLabel('Kalshi API Key')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('From https://docs.kalshi.com/api-reference/');

  const privateKeyInput = new TextInputBuilder()
    .setCustomId('kalshi_private_key')
    .setLabel('Kalshi Private Key')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Your RSA private key for signing orders');

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(apiKeyInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(privateKeyInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

/**
 * Handle modal submission for linking Kalshi account
 */
export async function handleLinkModal(interaction: any) {
  const kalshiApiKey = interaction.fields.getTextInputValue('kalshi_api_key');
  const kalshiPrivateKey = interaction.fields.getTextInputValue('kalshi_private_key');

  try {
    // Link the account with BOTH API Key and Private Key (no username needed)
    await kalshiUserManager.linkKalshiAccount(
      interaction.user.id,
      interaction.user.username, // Use Discord username as display name
      kalshiApiKey,
      kalshiPrivateKey
    );

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Account Linked!')
      .setDescription(`Successfully linked your Kalshi account to Discord`)
      .addFields(
        { 
          name: '🔐 Security', 
          value: 'Your API Key and Private Key are encrypted and stored securely.\n\nThey are never logged or displayed in plain text.',
          inline: false 
        },
        { 
          name: '🎯 Next Steps', 
          value: 'Use `/markets` to view predictions and `/bet` to place bets!',
          inline: false 
        }
      )
      .setFooter({ text: 'Your credentials are safe with AES-256-GCM encryption' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    console.log(`✅ Linked Kalshi account for ${interaction.user.username}`);
  } catch (error) {
    console.error('Error linking Kalshi account:', error);
    await interaction.reply({
      content: '❌ Failed to link account. Please check your credentials and try again.',
      ephemeral: true,
    });
  }
}
