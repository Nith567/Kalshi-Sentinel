import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

client.once('ready', async () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`📊 Bot is in ${client.guilds.cache.size} servers:`);
  
  client.guilds.cache.forEach(guild => {
    console.log(`   ${guild.name} (ID: ${guild.id})`);
  });
  
  process.exit(0);
});

client.login(process.env.CLIENT_TOKEN);
