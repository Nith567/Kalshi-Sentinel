# Kalshi Discord Bot

> **Prediction Markets Bot** powered by [Kalshi](https://kalshi.com) API

A Discord-native trading bot that lets users monitor Kalshi prediction markets, set alerts and automatically execute stop-loss trades in real time

---

## 🎯 **What is Kalshi Discord Bot?**

This bot brings Kalshi prediction markets directly into your Discord server. Users can:

- 📊 **View live markets** - Browse active prediction markets
- 💰 **Place bets** - Bet on outcomes using Discord commands
- � **Track portfolio** - View all your active bets and positions
- 💬 **Real-time updates** - Get market data in Discord channels
- 🔔 **Event subscriptions** - Get notified of market movements

**Everything happens in Discord. No external sites needed.**

---

## ⚡ **Features**

### Core Trading
- ✅ **Market Browsing** - View all active Kalshi prediction markets
- ✅ **Bet Placement** - Place YES/NO orders directly from Discord
- ✅ **Portfolio Tracking** - Monitor positions, balance, and P&L
- ✅ **Settlement History** - View resolved positions with profits/losses

### Real-Time WebSocket Monitoring
- ✅ **Live Price Feeds** - Connected to Kalshi WebSocket API
- ✅ **Price Alerts** - Get DM when price increases by X%
- ✅ **Stop Loss Orders** - Auto-execute SELL when price drops by X%
- ✅ **Market Info Fetching** - Automatically retrieve market details when alerts trigger

### Security & Encryption
- ✅ **AES-256-GCM Encryption** - Secure credential storage
- ✅ **RSA-PSS Signing** - All API requests cryptographically signed
- ✅ **Per-User Isolation** - Each user's credentials stored separately
- ✅ **MongoDB Persistence** - Encrypted credential backup

### User Experience
- **No external websites needed** - All interactions in Discord
- **Real market data** - Connected to actual Kalshi prediction markets
- **Instant notifications** - DM alerts when thresholds hit
- **Auto-execution** - Stop loss orders execute without user intervention
- **Mobile friendly** - Works on Discord mobile app

---

## 🚀 **Commands**

### Market Browsing
| Command | Description |
|---------|-------------|
| `/markets` | Browse available Kalshi prediction markets |

### Account Management
| Command | Description |
|---------|-------------|
| `/link` | Link your Kalshi API Key + Private Key to Discord |

### Trading & Portfolio
| Command | Description |
|---------|-------------|
| `/balance` | Check account balance & portfolio value |
| `/portfolio` | View portfolio with balance and net value |
| `/positions` | View current open market and event positions |
| `/settlements` | View settlement history with PnL |
| `/bet` | Place prediction market orders (YES/NO) |

### Automated Trading
| Command | Description |
|---------|-------------|
| `/alert` | Set price alerts (notifies when threshold hit) |
| `/stoploss` | Auto-exit positions (executes SELL order when price drops) |

---

## 🎯 **Key Features**

### 💰 **Prediction Market Trading**
- Browse live Kalshi prediction markets
- Place YES/NO orders on any market
- Track all open positions in real-time
- View settlement history and P&L

### 🔔 **Smart Alerts & Automation**
- **Price Alerts**: Get notified when price increases by X%
- **Stop Loss Orders**: Auto-execute SELL orders when price drops by X%
- **WebSocket Real-Time Monitoring**: Live price updates via Kalshi WebSocket API
- **Auto-DM Notifications**: Receive alerts directly in Discord DMs

### 📊 **Position Management**
- View current holdings (market & event positions)
- Track settlements and realized profits
- Monitor portfolio exposure & P&L
- See YES/NO contract counts per position

### 🔐 **Security & Privacy**
- AES-256-GCM encryption for storing API credentials
- RSA-PSS signing for all API requests
- Per-user credential isolation
- MongoDB secure storage

---

## ⚙️ **How It Works**

### User Flow
```
1. Run /link → Enter Kalshi API Key + Private Key
   ↓ (Encrypted and stored in MongoDB)
   
2. Run /markets → Browse prediction markets
   ↓
   
3. Run /bet → Place YES/NO orders
   ↓
   
4. Run /positions → View holdings
   ↓
   
5. Run /alert set TICKER yes 10 → Alert when YES price +10%
   ↓
   
6. Run /stoploss set TICKER yes 10 → Auto-sell when YES price -10%
   ↓
   
7. Get WebSocket real-time updates via DM notifications
```

### Alert System
```
Price Alert (/alert):
- Monitor price in real-time via WebSocket
- Send DM notification when threshold hit
- Show market info, current prices, P&L

Stop Loss Order (/stoploss):
- Monitor price in real-time via WebSocket
- Auto-execute SELL order when triggered
- Fetch actual position size
- Send DM with order confirmation + ID
```

---

## 🏗️ **Tech Stack**

- **Discord.js v14** - Discord bot framework
- **Kalshi API v2** - Real-time market data & trading
- **WebSocket API** - Live price monitoring (wss://demo-api.kalshi.co/trade-api/ws/v2)
- **MongoDB** - Secure credential storage
- **TypeScript** - Type-safe development
- **Axios** - HTTP requests
- **Node.js Crypto** - RSA-PSS signing & AES-256-GCM encryption
- **Bun** - Fast runtime & package manager

---

## 📦 **Installation & Setup**

### Prerequisites
- Node.js v18+
- MongoDB database
- Discord Bot Token
- Kalshi API credentials
- Encryption key for storing API tokens securely

### Environment Variables
Create a `.env` file:

```env
# Discord
CLIENT_TOKEN=your_discord_bot_token
APPLICATION_ID=your_discord_application_id

# Kalshi API (users will link their own accounts)
# No need to set this here - users provide their own API key via /link command

# Encryption (for storing API tokens securely)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_32_byte_hex_encryption_key
```

### Generate Encryption Key

```bash
# macOS/Linux
openssl rand -hex 32

# This generates a 64-character hex string - paste it into ENCRYPTION_KEY
```

### Install & Run

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the bot
npm start

# Development mode
npm run dev
```

---

## 📖 **Kalshi API**

Documentation: [https://docs.kalshi.com](https://docs.kalshi.com)

### Endpoints Used
- `GET /trade-api/v2/markets` - Browse markets
- `GET /trade-api/v2/markets/{ticker}` - Market details
- `GET /trade-api/v2/portfolio/balance` - Account balance
- `GET /trade-api/v2/portfolio/positions` - Current positions
- `GET /trade-api/v2/portfolio/settlements` - Settlement history
- `POST /trade-api/v2/portfolio/orders` - Place orders (including SELL to exit)
- `wss://demo-api.kalshi.co/trade-api/ws/v2` - Real-time price WebSocket

### Authentication
All requests are signed with:
- **RSA-PSS**: Private key signing
- **Timestamp**: Request timestamp for replay prevention
- **API Key**: User's Kalshi API Key
- **Signature**: Base64-encoded RSA-PSS signature

---

## 🎮 **User Flow**

1. **User runs `/link`** 
   - Enters Kalshi API Key + Private Key via Discord modal
   - Credentials encrypted with AES-256-GCM
   - Stored securely in MongoDB

2. **User runs `/markets`** 
   - Views available prediction markets
   - Sees YES/NO prices and open interest

3. **User runs `/bet`** 
   - Places YES or NO order on a market
   - Order sent to Kalshi with RSA-PSS signature
   - Gets confirmation with order ID

4. **User runs `/positions`** 
   - Views current holdings (market & event positions)
   - Sees position size, exposure, P&L
   - Gets alert/stoploss quick links

5. **User runs `/alert set TICKER yes 10`**
   - WebSocket connects to Kalshi
   - Monitors YES price in real-time
   - When price reaches +10% from entry → DM alert with market info

6. **User runs `/stoploss set TICKER yes 10`**
   - WebSocket connects to Kalshi
   - Monitors YES price in real-time  
   - When price drops -10% → Auto-executes SELL order
   - DM confirmation shows order ID, quantity, status

7. **User runs `/settlements`**
   - Views resolved positions
   - Sees P&L for each settled market

**Everything happens in Discord with real Kalshi market data.**

---

## 🔐 **Security**

- **Secure authentication** - Kalshi API token management
- **MongoDB encryption** - Secure data storage
- **Discord permissions** - User authentication per server
- **Token isolation** - Per-user session handling

---

## 📝 **License**

MIT License

---

## 🔗 **Links**

- [Kalshi](https://kalshi.com)
- [Kalshi API Docs](https://docs.kalshi.com)
- [Discord.js](https://discord.js.org)
---

**Built with ❤️ for Kalshi prediction markets**


