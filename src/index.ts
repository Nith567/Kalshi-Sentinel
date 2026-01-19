import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import * as dotenv from "dotenv";
import { databaseManager } from "./database-manager.js";
import { kalshiUserManager } from "./kalshi-user-manager.js";
import { alertManager } from "./alert-manager.js";
import { stopLossManager } from "./stoploss-manager.js";

// Import commands
import {
  marketsCommand,
  executeMarkets,
  linkCommand,
  executeLink,
  handleLinkModal,
  betCommand,
  executeBet,
  portfolioCommand,
  executePortfolio,
  balanceCommand,
  executeBalance,
  settlementsCommand,
  executeSettlements,
  positionsCommand,
  executePositions,
  alertCommand,
  executeAlert,
  stoplossCommand,
  executeStopLoss,
} from './commands/index.js';

declare var process: any;

dotenv.config();

const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const APPLICATION_ID = process.env.APPLICATION_ID;
const MONGODB_URI = process.env.MONGODB_URI;

if (!CLIENT_TOKEN) {
  throw new Error("No CLIENT_TOKEN provided.");
}

if (!APPLICATION_ID) {
  throw new Error("No APPLICATION_ID provided.");
}

if (!MONGODB_URI) {
  throw new Error("No MONGODB_URI provided.");
}

// Create a new client instance with necessary intents
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ] 
});

client.once(Events.ClientReady, async (discord) => {
  try {
    console.log(`🤖 Kalshi Discord Bot Ready! Logged in as ${discord.user.tag}`);
    console.log(`📊 Prediction betting bot for Kalshi`);
    
    // Initialize alert manager with Discord client
    alertManager.setDiscordClient(client);
    stopLossManager.setDiscordClient(client);
    
    // Initialize database
    await databaseManager.connect();
    await kalshiUserManager.connect(MONGODB_URI);
    
    console.log('✅ Database connected');
    console.log('✅ Kalshi API client ready');
    console.log('✅ Alert manager initialized');

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(CLIENT_TOKEN);

    // Register Kalshi bot commands
    const commands = [
      marketsCommand,
      linkCommand,
      betCommand,
      portfolioCommand,
      balanceCommand,
      settlementsCommand,
      positionsCommand,
      alertCommand,
      stoplossCommand,
    ];

    await rest.put(Routes.applicationCommands(APPLICATION_ID), {
      body: commands.map(cmd => cmd.toJSON()),
    });

    console.log('✅ Registered commands: /markets, /link, /bet, /portfolio, /balance, /settlements, /positions, /alert, /stoploss');

    // Handle interactions (slash commands)
    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isCommand()) {
        const { commandName } = interaction;

        try {
          switch (commandName) {
            case 'markets':
              await executeMarkets(interaction as ChatInputCommandInteraction);
              break;
            case 'link':
              await executeLink(interaction as ChatInputCommandInteraction);
              break;
            case 'bet':
              await executeBet(interaction as ChatInputCommandInteraction);
              break;
            case 'portfolio':
              await executePortfolio(interaction as ChatInputCommandInteraction);
              break;
            case 'balance':
              await executeBalance(interaction as ChatInputCommandInteraction);
              break;
            case 'settlements':
              await executeSettlements(interaction as ChatInputCommandInteraction);
              break;
            case 'positions':
              await executePositions(interaction as ChatInputCommandInteraction);
              break;
            case 'alert':
              await executeAlert(interaction as ChatInputCommandInteraction);
              break;
            case 'stoploss':
              await executeStopLoss(interaction as ChatInputCommandInteraction);
              break;
            default:
              await interaction.reply({
                content: '❌ Unknown command.',
                ephemeral: true,
              });
          }
        } catch (error) {
          console.error(`Error executing /${commandName}:`, error);
          // Don't try to reply here - let the command handler deal with it
        }
      }
      
      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'kalshi_link_modal') {
          await handleLinkModal(interaction);
        }
      }
    });

    console.log('✅ Kalshi bot initialized!');
    console.log('📋 Ready for prediction trading...');

    // Handle when bot is added to a new server
    client.on(Events.GuildCreate, async (guild) => {
      console.log(`🚀 Kalshi bot added to server: ${guild.name} (${guild.id})`);
      
      try {
        const owner = await guild.fetchOwner();
        console.log(`✅ Server owner: ${owner.user.username}`);
      } catch (error) {
        console.error('Could not fetch server owner:', error);
      }
    });

    console.log('🚀 Kalshi bot started successfully!');
    console.log('⏳ Ready for prediction trading...');

  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
});

// Error handling
client.on('error', (error: any) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error: any) => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Start the bot
client.login(CLIENT_TOKEN);

console.log('🤖 Starting Kalshi Discord Bot');
console.log('📊 Platform: Kalshi Prediction Markets');
console.log('🎯 Features: Browse markets, link accounts, place bets, track portfolio');
