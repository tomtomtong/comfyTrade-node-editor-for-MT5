// MT5 Bridge - Communicates with MetaTrader 5 via Python WebSocket bridge
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const TwilioAlerts = require('./twilio-alerts');
const SentimentAnalyzer = require('./sentiment-analyzer');

class MT5Bridge {
  constructor() {
    this.connected = false;
    this.ws = null;
    this.pythonProcess = null;
    this.messageQueue = new Map();
    this.messageId = 0;
    this.mt5Process = null;
    this.twilioAlerts = null;
    this.twilioConfig = {};
    this.alertConfig = {};
    this.loadTwilioConfig();
  }
  
  loadTwilioConfig() {
    /**Load Twilio configuration from unified settings file*/
    try {
      const settingsPath = path.join(__dirname, 'app_settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const twilioConfig = settings.twilio || {};
        this.twilioConfig = twilioConfig;
        this.alertConfig = {
          recipient_number: twilioConfig.recipientNumber || '',
          method: twilioConfig.method || 'sms',
          alerts: twilioConfig.alerts || {}
        };
        
        if (twilioConfig.enabled && twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.fromNumber) {
          this.twilioAlerts = new TwilioAlerts(
            twilioConfig.accountSid,
            twilioConfig.authToken,
            twilioConfig.fromNumber
          );
          console.log("Twilio alerts configured and enabled");
        } else {
          console.log("Twilio alerts disabled in configuration");
          this.twilioAlerts = null;
        }
      } else {
        console.warn("app_settings.json not found. Twilio alerts disabled.");
        this.twilioConfig = {};
      }
    } catch (error) {
      console.error(`Error loading Twilio config: ${error}`);
      this.twilioConfig = {};
    }
  }

  launchMT5() {
    return new Promise((resolve) => {
      // Common MT5 installation paths
      const mt5Paths = [
        'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
        'C:\\Program Files (x86)\\MetaTrader 5\\terminal64.exe',
        path.join(process.env.APPDATA, 'MetaQuotes\\Terminal\\terminal64.exe')
      ];

      let mt5Path = null;
      for (const p of mt5Paths) {
        if (fs.existsSync(p)) {
          mt5Path = p;
          break;
        }
      }

      if (mt5Path) {
        console.log(`Launching MT5 from: ${mt5Path}`);
        this.mt5Process = spawn(mt5Path, [], { detached: true, stdio: 'ignore' });
        this.mt5Process.unref();

        // Wait for MT5 to start
        setTimeout(resolve, 3000);
      } else {
        console.log('MT5 not found in common locations, assuming already running');
        resolve();
      }
    });
  }

  startPythonBridge() {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, 'mt5_bridge.py');

      // Start Python bridge
      this.pythonProcess = spawn('python', [pythonScript]);

      this.pythonProcess.stdout.on('data', (data) => {
        console.log(`Python Bridge: ${data}`);
        if (data.toString().includes('WebSocket server started')) {
          resolve();
        }
      });

      this.pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Bridge Error: ${data}`);
      });

      this.pythonProcess.on('close', (code) => {
        console.log(`Python bridge exited with code ${code}`);
        this.connected = false;
      });

      // Give it time to start
      setTimeout(resolve, 2000);
    });
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('ws://localhost:8765');

      this.ws.on('open', () => {
        console.log('Connected to Python MT5 bridge');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          const messageId = response.messageId;

          // Log MT5 responses for trade execution and market data
          if (response.action === 'executeOrder') {
            console.log('MT5 Trade Response received:', {
              action: response.action,
              success: response.success,
              data: response.data,
              error: response.error,
              messageId: messageId,
              timestamp: new Date().toISOString()
            });
          } else if (response.action === 'getMarketData') {
            console.log('📡 WebSocket Market Data Response:', {
              action: response.action,
              success: response.success,
              data: response.data,
              error: response.error,
              messageId: messageId,
              timestamp: new Date().toISOString()
            });
          }

          if (this.messageQueue.has(messageId)) {
            const { resolve } = this.messageQueue.get(messageId);
            this.messageQueue.delete(messageId);
            resolve(response);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.connected = false;
      });
    });
  }

  async sendMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      const messageId = this.messageId++;
      const message = { action, messageId, ...data };

      this.messageQueue.set(messageId, { resolve, reject });

      this.ws.send(JSON.stringify(message));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.messageQueue.has(messageId)) {
          this.messageQueue.delete(messageId);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async connect(config) {
    try {
      // Launch MT5 if not running
      await this.launchMT5();

      // Start Python bridge
      await this.startPythonBridge();

      // Connect WebSocket
      await this.connectWebSocket();

      // Connect to MT5
      const response = await this.sendMessage('connect', {
        login: config.login,
        password: config.password,
        server: config.server
      });

      this.connected = response.success;
      return this.connected;
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  async getAccountInfo() {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getAccountInfo');
    return response.data;
  }

  async executeStrategy(strategy) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Executing strategy:', strategy);

    const response = await this.sendMessage('executeOrder', {
      symbol: strategy.symbol,
      type: strategy.type,
      volume: strategy.volume,
      stopLoss: strategy.stopLoss,
      takeProfit: strategy.takeProfit
    });

    return response.data;
  }

  async getPositions() {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getPositions');
    return response.data;
  }

  async getPendingOrders() {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getPendingOrders');
    // Return the data directly (array of orders or error object)
    return response.data;
  }

  async cancelPendingOrder(ticket) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Cancelling pending order:', ticket);
    const response = await this.sendMessage('cancelPendingOrder', { ticket });
    return response.data;
  }

  async modifyPendingOrder(ticket, stopLoss, takeProfit, price) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Modifying pending order:', ticket, 'SL:', stopLoss, 'TP:', takeProfit, 'Price:', price);
    const response = await this.sendMessage('modifyPendingOrder', {
      ticket,
      stopLoss,
      takeProfit,
      price
    });
    return response.data;
  }

  async closePosition(ticket) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Closing position:', ticket);
    const response = await this.sendMessage('closePosition', { ticket });
    return response.data;
  }

  async modifyPosition(ticket, stopLoss, takeProfit) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Modifying position:', ticket, 'SL:', stopLoss, 'TP:', takeProfit);
    const response = await this.sendMessage('modifyPosition', {
      ticket,
      stopLoss,
      takeProfit
    });
    return response.data;
  }

  async executeNodeStrategy(nodeGraph) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Executing node-based strategy:', nodeGraph);

    const response = await this.sendMessage('executeNodeStrategy', { nodeGraph });
    return response.data || {
      success: true,
      executedNodes: nodeGraph.nodes.length,
      message: 'Node strategy executed'
    };
  }

  async getMarketData(symbol) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`🔄 MT5 Bridge: Requesting market data for ${symbol}`);
    
    try {
      const response = await this.sendMessage('getMarketData', { symbol });
      
      // Log the complete response from Python bridge
      console.log(`📡 MT5 Bridge Response for ${symbol}:`, {
        success: response.success,
        data: response.data,
        error: response.error,
        action: response.action,
        messageId: response.messageId,
        timestamp: new Date().toISOString()
      });
      
      if (response.data && !response.data.error) {
        console.log(`✅ MT5 Bridge: Market data received for ${symbol}:`, {
          bid: response.data.bid,
          ask: response.data.ask,
          spread: response.data.spread,
          volume: response.data.volume,
          time: response.data.time
        });
      } else {
        console.error(`❌ MT5 Bridge: Market data failed for ${symbol}:`, response.data?.error || 'Unknown error');
      }
      
      return response.data;
    } catch (error) {
      console.error(`❌ MT5 Bridge: Exception getting market data for ${symbol}:`, {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async getSymbols(group = '*') {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getSymbols', { group });
    return response.data;
  }

  async searchSymbols(query) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('searchSymbols', { query });
    return response.data;
  }

  async getSymbolInfo(symbol) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getSymbolInfo', { symbol });
    return response.data;
  }

  async executeOrder(orderData) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Executing order:', orderData);
    const response = await this.sendMessage('executeOrder', {
      symbol: orderData.symbol,
      type: orderData.type,
      executionType: orderData.executionType || 'MARKET',
      limitPrice: orderData.limitPrice || null,
      volume: orderData.volume,
      stopLoss: orderData.stopLoss || 0,
      takeProfit: orderData.takeProfit || 0
    });

    return response.data;
  }

  async getHistoricalData(symbol, timeframe, startDate, endDate, bars) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getHistoricalData', {
      symbol,
      timeframe,
      startDate,
      endDate,
      bars
    });

    return response.data;
  }

  async getPercentageChange(symbol, timeframe = 'M1') {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getPercentageChange', {
      symbol,
      timeframe
    });

    return response.data;
  }

  async sendTwilioAlert(alertData) {
    // Twilio alerts work independently of MT5 connection
    console.log('Sending Twilio alert:', alertData);
    
    if (!this.twilioAlerts || !this.twilioAlerts.isEnabled()) {
      return { success: false, error: "Twilio not configured" };
    }
    
    const toNumber = alertData.toNumber || this.alertConfig.recipient_number;
    if (!toNumber) {
      return { success: false, error: "No recipient number provided" };
    }
    
    const method = alertData.method || this.alertConfig.method || 'sms';
    const message = alertData.message || '';
    
    try {
      const result = await this.twilioAlerts.sendCustomAlert(message, toNumber, method);
      return result;
    } catch (error) {
      console.error('Error sending Twilio alert:', error);
      return { success: false, error: error.message };
    }
  }

  async getTwilioConfig() {
    // Twilio config works independently of MT5 connection
    console.log('Getting Twilio config...');
    
    return {
      enabled: this.twilioAlerts !== null && this.twilioAlerts.isEnabled(),
      config: this.alertConfig,
      twilioConfig: {
        enabled: this.twilioConfig.enabled || false,
        accountSid: this.twilioConfig.accountSid || '',
        authToken: this.twilioConfig.authToken ? '***' + this.twilioConfig.authToken.slice(-4) : '',
        fromNumber: this.twilioConfig.fromNumber || '',
        recipientNumber: this.twilioConfig.recipientNumber || '',
        method: this.twilioConfig.method || 'sms',
        alerts: this.twilioConfig.alerts || {}
      }
    };
  }

  async updateTwilioConfig(configData) {
    // Twilio config works independently of MT5 connection
    console.log('Updating Twilio config...');
    
    try {
      const settingsPath = path.join(__dirname, 'app_settings.json');
      let currentConfig = {};
      
      if (fs.existsSync(settingsPath)) {
        currentConfig = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      
      // Ensure twilio section exists
      if (!currentConfig.twilio) {
        currentConfig.twilio = {};
      }
      
      // Update with new data
      if (configData.twilio) {
        const twilioData = configData.twilio;
        currentConfig.twilio.enabled = twilioData.enabled !== undefined ? twilioData.enabled : currentConfig.twilio.enabled;
        currentConfig.twilio.accountSid = twilioData.accountSid || twilioData.account_sid || currentConfig.twilio.accountSid || '';
        currentConfig.twilio.authToken = twilioData.authToken || twilioData.auth_token || currentConfig.twilio.authToken || '';
        currentConfig.twilio.fromNumber = twilioData.fromNumber || twilioData.from_number || currentConfig.twilio.fromNumber || '';
      }
      
      if (configData.notifications) {
        const notificationsData = configData.notifications;
        currentConfig.twilio.recipientNumber = notificationsData.recipient_number || notificationsData.recipientNumber || currentConfig.twilio.recipientNumber || '';
        currentConfig.twilio.method = notificationsData.method || currentConfig.twilio.method || 'sms';
        currentConfig.twilio.alerts = notificationsData.alerts || currentConfig.twilio.alerts || {};
      }
      
      // Also handle direct twilio config updates
      if (configData.recipientNumber !== undefined) {
        currentConfig.twilio.recipientNumber = configData.recipientNumber;
      }
      if (configData.method !== undefined) {
        currentConfig.twilio.method = configData.method;
      }
      if (configData.alerts !== undefined) {
        currentConfig.twilio.alerts = configData.alerts;
      }
      
      // Save updated config
      fs.writeFileSync(settingsPath, JSON.stringify(currentConfig, null, 2), 'utf8');
      
      // Reload configuration
      this.loadTwilioConfig();
      
      return { success: true, message: "Twilio configuration updated" };
    } catch (error) {
      console.error(`Error updating Twilio config: ${error}`);
      return { success: false, error: error.message };
    }
  }

  async getClosedPositions(daysBack = 7) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const timeLabel = daysBack < 1 ? `${Math.round(daysBack * 24)} hour${Math.round(daysBack * 24) > 1 ? 's' : ''}` : `${daysBack} day${daysBack > 1 ? 's' : ''}`;
    console.log(`Getting closed positions for last ${timeLabel}...`);
    const response = await this.sendMessage('getClosedPositions', { daysBack });
    return response.data;
  }

  async toggleSimulatorMode(enabled) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Toggling simulator mode: ${enabled ? 'ON' : 'OFF'}`);
    const response = await this.sendMessage('toggleSimulatorMode', { enabled });
    return response.data;
  }

  async getSimulatorStatus() {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    const response = await this.sendMessage('getSimulatorStatus');
    return response.data;
  }

  async resetSimulator(initialBalance = 10000) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Resetting simulator with balance: ${initialBalance}`);
    const response = await this.sendMessage('resetSimulator', { initialBalance });
    return response.data;
  }

  async getYFinanceData(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Getting yFinance data for: ${params.symbol}`);
    const response = await this.sendMessage('getYFinanceData', params);
    return response.data;
  }

  async getAlphaVantageData(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Getting Alpha Vantage data for: ${params.symbol}`);
    const response = await this.sendMessage('getAlphaVantageData', params);
    return response.data;
  }

  async callLLM(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Calling LLM with model: ${params.model}`);
    const response = await this.sendMessage('callLLM', params);
    return response.data;
  }

  async firecrawlScrape(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Firecrawling URL: ${params.url}`);
    const response = await this.sendMessage('firecrawlScrape', params);
    return response.data;
  }

  async executePythonScript(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Executing Python script');
    const response = await this.sendMessage('executePythonScript', params);
    return response.data;
  }

  async getSentimentAnalysis(params) {
    // Sentiment analysis now works directly in JavaScript using Alpha Vantage - no MT5 connection needed
    try {
      const keywords = params.keywords || params.symbol || '';
      
      // Validate that keywords are provided
      if (!keywords || (typeof keywords === 'string' && keywords.trim() === '') || 
          (Array.isArray(keywords) && keywords.length === 0)) {
        throw new Error('No keywords or symbols provided. Please specify keywords or symbols for sentiment analysis.');
      }
      const daysBack = params.daysBack || params.days_back || 7;
      const maxResults = params.maxResults || params.max_results || 30;
      
      // Always use Alpha Vantage settings from app_settings.json
      let apiKey = '';
      let baseUrl = 'https://www.alphavantage.co/query';
      
      try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(__dirname, 'app_settings.json');
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          const avSettings = settings.ai?.alphavantage;
          if (avSettings && avSettings.enabled && avSettings.apiKey) {
            apiKey = avSettings.apiKey;
            baseUrl = avSettings.baseUrl || baseUrl;
            console.log('Using Alpha Vantage API key from settings');
          } else {
            console.warn('Alpha Vantage is not enabled or API key not found in settings');
          }
        }
      } catch (error) {
        console.warn('Could not read Alpha Vantage settings from file:', error.message);
      }

      console.log(`Getting sentiment analysis for keywords: ${keywords} using Alpha Vantage`);

      const analyzer = new SentimentAnalyzer(apiKey || null, baseUrl);
      const result = await analyzer.getSentimentAnalysis(keywords, daysBack, maxResults);

      // Format result to match expected structure
      return {
        symbol: Array.isArray(keywords) ? keywords.join(', ') : keywords,
        keywords: Array.isArray(keywords) ? keywords : [keywords],
        ...result
      };
    } catch (error) {
      console.error('Error in sentiment analysis:', error);
      // Return error in a format that can be handled by the caller
      // The IPC handler will wrap this in { success: false, error: ... }
      throw error;
    }
  }

  async getRSIGraph(params) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log(`Generating RSI Graph for: ${params.symbol}`);
    const response = await this.sendMessage('getRSIGraph', params);
    return response.data;
  }

  isConnected() {
    return this.connected;
  }

  shutdown() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.pythonProcess) {
      this.pythonProcess.kill();
    }
  }
}

module.exports = MT5Bridge;
