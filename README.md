# MT5 Trading Strategy Executor

An Electron desktop application that provides a comprehensive trading platform for MetaTrader 5, featuring visual strategy building, backtesting, and AI trading agent creation.

## Screenshots

<div align="center">
  <img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/059/127/datas/original.jpg" alt="MT5 Trading Strategy Executor Screenshot 1" width="48%" />
  <img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/059/128/datas/original.jpg" alt="MT5 Trading Strategy Executor Screenshot 2" width="48%" />
</div>

## 🚀 Build AI Trading Agents Easily

**You can easily build powerful AI agents for trading with this tool!** This platform provides everything you need to create sophisticated automated trading systems without extensive coding knowledge. Watch our tutorial to see how simple it is:

📹 **[Watch Tutorial: Building AI Trading Agents](https://youtu.be/M4PLVVUaQo8)**

💬 **[Join our Discord Community](https://discord.gg/4EWYahsGdJ)** - Get help, share strategies, and connect with other traders!

The visual node-based interface makes it straightforward to connect AI models, market data, and trading logic into fully automated trading agents that can analyze markets, make decisions, and execute trades 24/7.

## Features

- **🤖 AI Agent Building**: Easily create AI-powered trading agents with our intuitive visual interface - no complex coding required!
- **Visual Strategy Building**: Node-based drag-and-drop interface for creating trading strategies without coding
- **MT5 Integration**: Direct connection to MetaTrader 5 for real-time trading and data access
- **Simulator Mode**: Paper trading with simulated positions using real market data
- **Historical Backtesting**: Import and test strategies against historical data from MT5 or CSV files
- **Risk Management**: Built-in pip-based loss calculations, volume limits, and overtrade protection
- **Real-time Alerts**: SMS/WhatsApp notifications via Twilio for trade events
- **Market Analysis**: Sentiment analysis and news integration for informed trading decisions

## Installation

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

## Configuration

Before using the application, you need to configure your API keys and settings:

1. **Copy the example settings file:**
   ```bash
   cp app_settings.json.example app_settings.json
   ```

2. **Edit `app_settings.json`** and add your API keys:
   - **Firecrawl API Key**: For web scraping and content extraction
   - **OpenRouter API Key**: For AI/LLM model access (Claude, GPT, etc.)
   - **Alpha Vantage API Key**: For market data and financial information
   - **Twilio Credentials**: For SMS/WhatsApp alerts (optional)
   - **Telegram Bot Token**: For Telegram notifications (optional)

3. **Important**: The `app_settings.json` file is gitignored and will not be committed to the repository. Never commit your API keys!

## Usage

```bash
# Start the application
npm start

# Build for distribution
npm run build
```

## Technology Stack

- **Frontend**: Electron, HTML/CSS/JavaScript, Chart.js
- **Backend**: Node.js, Python 3.8+
- **Trading**: MetaTrader5 Python API
- **Communication**: WebSocket for Electron-Python bridge

## License

This project is licensed under the MIT License - see below for details.

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**This repository is public and licensed under the MIT License, an OSI-approved Open Source License.**
