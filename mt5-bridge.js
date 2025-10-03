// MT5 Bridge - Communicates with MetaTrader 5 via Python WebSocket bridge
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class MT5Bridge {
  constructor() {
    this.connected = false;
    this.ws = null;
    this.pythonProcess = null;
    this.messageQueue = new Map();
    this.messageId = 0;
    this.mt5Process = null;
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

    const response = await this.sendMessage('getMarketData', { symbol });
    return response.data;
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

  async executeOrder(orderData) {
    if (!this.connected) {
      throw new Error('Not connected to MT5');
    }

    console.log('Executing order:', orderData);
    const response = await this.sendMessage('executeOrder', {
      symbol: orderData.symbol,
      type: orderData.type,
      volume: orderData.volume,
      stopLoss: orderData.stopLoss || 0,
      takeProfit: orderData.takeProfit || 0
    });

    return response.data;
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
