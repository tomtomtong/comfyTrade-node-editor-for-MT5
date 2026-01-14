const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const MT5Bridge = require('./mt5-bridge');
const SMSScheduler = require('./sms-scheduler');

let mainWindow;
let mt5Bridge;
let smsScheduler;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();
    mt5Bridge = new MT5Bridge();
    
    // Initialize SMS Scheduler
    smsScheduler = new SMSScheduler();
    
    // Set up error callback to send SMS errors to UI
    smsScheduler.setErrorCallback((errorMessage) => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sms:error', errorMessage);
        }
    });
    
    smsScheduler.start();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (mt5Bridge) {
        mt5Bridge.shutdown();
    }
    if (smsScheduler) {
        smsScheduler.stop();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('mt5:connect', async (event, config) => {
    try {
        await mt5Bridge.connect(config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getAccountInfo', async () => {
    try {
        const info = await mt5Bridge.getAccountInfo();
        return { success: true, data: info };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:executeStrategy', async (event, strategy) => {
    try {
        const result = await mt5Bridge.executeStrategy(strategy);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getPositions', async () => {
    try {
        const positions = await mt5Bridge.getPositions();
        return { success: true, data: positions };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getPendingOrders', async () => {
    try {
        const orders = await mt5Bridge.getPendingOrders();
        return { success: true, data: orders };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:cancelPendingOrder', async (event, ticket) => {
    try {
        const result = await mt5Bridge.cancelPendingOrder(ticket);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:modifyPendingOrder', async (event, { ticket, stopLoss, takeProfit, price }) => {
    try {
        const result = await mt5Bridge.modifyPendingOrder(ticket, stopLoss, takeProfit, price);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:closePosition', async (event, ticket) => {
    try {
        const result = await mt5Bridge.closePosition(ticket);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:executeNodeStrategy', async (event, nodeGraph) => {
    try {
        const result = await mt5Bridge.executeNodeStrategy(nodeGraph);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getMarketData', async (event, symbol) => {
    try {
        const data = await mt5Bridge.getMarketData(symbol);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:modifyPosition', async (event, { ticket, stopLoss, takeProfit }) => {
    try {
        const result = await mt5Bridge.modifyPosition(ticket, stopLoss, takeProfit);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getSymbols', async (event, group) => {
    try {
        const symbols = await mt5Bridge.getSymbols(group);
        return { success: true, data: symbols };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:searchSymbols', async (event, query) => {
    try {
        const symbols = await mt5Bridge.searchSymbols(query);
        return { success: true, data: symbols };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getSymbolInfo', async (event, symbol) => {
    try {
        const symbolInfo = await mt5Bridge.getSymbolInfo(symbol);
        return { success: true, data: symbolInfo };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:executeOrder', async (event, orderData) => {
    try {
        const result = await mt5Bridge.executeOrder(orderData);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getHistoricalData', async (event, { symbol, timeframe, startDate, endDate, bars }) => {
    try {
        const result = await mt5Bridge.getHistoricalData(symbol, timeframe, startDate, endDate, bars);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getPercentageChange', async (event, { symbol, timeframe }) => {
    try {
        const result = await mt5Bridge.getPercentageChange(symbol, timeframe);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:sendTwilioAlert', async (event, alertData) => {
    try {
        const result = await mt5Bridge.sendTwilioAlert(alertData);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getTwilioConfig', async (event) => {
    try {
        const result = await mt5Bridge.getTwilioConfig();
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:updateTwilioConfig', async (event, configData) => {
    try {
        const result = await mt5Bridge.updateTwilioConfig(configData);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getClosedPositions', async (event, daysBack) => {
    try {
        const result = await mt5Bridge.getClosedPositions(daysBack);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:toggleSimulatorMode', async (event, enabled) => {
    try {
        const result = await mt5Bridge.toggleSimulatorMode(enabled);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getSimulatorStatus', async (event) => {
    try {
        const result = await mt5Bridge.getSimulatorStatus();
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:resetSimulator', async (event, initialBalance) => {
    try {
        const result = await mt5Bridge.resetSimulator(initialBalance);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getYFinanceData', async (event, params) => {
    try {
        const result = await mt5Bridge.getYFinanceData(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getAlphaVantageData', async (event, params) => {
    try {
        const result = await mt5Bridge.getAlphaVantageData(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:callLLM', async (event, params) => {
    try {
        const result = await mt5Bridge.callLLM(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:firecrawlScrape', async (event, params) => {
    try {
        const result = await mt5Bridge.firecrawlScrape(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:executePythonScript', async (event, params) => {
    try {
        const result = await mt5Bridge.executePythonScript(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('mt5:getSentimentAnalysis', async (event, params) => {
    try {
        if (!mt5Bridge) {
            return { success: false, error: 'MT5Bridge not initialized' };
        }
        if (typeof mt5Bridge.getSentimentAnalysis !== 'function') {
            return { success: false, error: 'getSentimentAnalysis is not a function on mt5Bridge' };
        }
        const result = await mt5Bridge.getSentimentAnalysis(params);
        // If result already has success/data structure, return it as-is
        if (result && typeof result === 'object' && 'success' in result) {
            return result;
        }
        // Otherwise wrap it
        return { success: true, data: result };
    } catch (error) {
        console.error('Error in mt5:getSentimentAnalysis handler:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
});

ipcMain.handle('mt5:getRSIGraph', async (event, params) => {
    try {
        const result = await mt5Bridge.getRSIGraph(params);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Handler for opening external URLs
ipcMain.handle('electron:openExternal', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Handler for saving chart image
ipcMain.handle('chart:saveImage', async (event, { imageData, ticket, symbol }) => {
    try {
        // Create charts directory if it doesn't exist
        const chartsDir = path.join(__dirname, 'charts');
        await fs.mkdir(chartsDir, { recursive: true });
        
        // Generate filename with ticket and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `chart_${symbol}_${ticket}_${timestamp}.png`;
        const filePath = path.join(chartsDir, filename);
        
        // Convert base64 data to buffer and save
        const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filePath, buffer);
        
        return { success: true, filePath: filePath };
    } catch (error) {
        console.error('Error saving chart image:', error);
        return { success: false, error: error.message };
    }
});

// Handler for opening file
ipcMain.handle('electron:openPath', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Handler for reading image file as base64
ipcMain.handle('chart:readImage', async (event, filePath) => {
    try {
        const imageBuffer = await fs.readFile(filePath);
        const base64 = imageBuffer.toString('base64');
        return { success: true, data: `data:image/png;base64,${base64}` };
    } catch (error) {
        console.error('Error reading image file:', error);
        return { success: false, error: error.message };
    }
});

// Settings file handlers with comprehensive JSON error logging
ipcMain.handle('settings:load', async (event, filename) => {
    try {
        const filePath = path.join(__dirname, filename);
        const data = await fs.readFile(filePath, 'utf8');
        
        // Attempt to parse JSON with detailed error logging
        try {
            return JSON.parse(data);
        } catch (parseError) {
            console.error(`❌ JSON Parse Error in ${filename}:`);
            console.error(`   File path: ${filePath}`);
            console.error(`   Parse error: ${parseError.message}`);
            console.error(`   File content preview (first 200 chars):`);
            console.error(`   "${data.substring(0, 200)}${data.length > 200 ? '...' : ''}"`);
            
            // Try to identify common JSON issues
            if (data.trim() === '') {
                console.error(`   Issue: File is empty`);
            } else if (!data.trim().startsWith('{') && !data.trim().startsWith('[')) {
                console.error(`   Issue: File doesn't start with { or [ (not valid JSON)`);
            } else if (!data.trim().endsWith('}') && !data.trim().endsWith(']')) {
                console.error(`   Issue: File doesn't end with } or ] (incomplete JSON)`);
            }
            
            throw new Error(`Invalid JSON format in ${filename}: ${parseError.message}`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return null to trigger migration
            console.log(`📁 Settings file ${filename} not found, will create new one`);
            return null;
        }
        console.error(`❌ Error loading settings file ${filename}:`, error.message);
        throw error;
    }
});

ipcMain.handle('settings:save', async (event, filename, settings) => {
    try {
        const filePath = path.join(__dirname, filename);
        await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
        
        // Reload scheduler if Twilio settings changed
        if (smsScheduler && settings.twilio) {
            smsScheduler.reload();
        }
        
        return { success: true };
    } catch (error) {
        throw error;
    }
});

// SMS Scheduler IPC Handlers
ipcMain.handle('sms:getReminders', async () => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        const reminders = smsScheduler.getReminders();
        return { success: true, data: reminders };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sms:addReminder', async (event, reminder) => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        const id = smsScheduler.addReminder(reminder);
        return { success: true, data: { id } };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sms:updateReminder', async (event, reminderId, updates) => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        smsScheduler.updateReminder(reminderId, updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sms:deleteReminder', async (event, reminderId) => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        smsScheduler.deleteReminder(reminderId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sms:reloadScheduler', async () => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        smsScheduler.reload();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sms:testSend', async (event, { recipientNumber, message }) => {
    try {
        if (!smsScheduler) {
            return { success: false, error: 'Scheduler not initialized' };
        }
        
        // Use the scheduler's twilioAlerts instance
        if (!smsScheduler.twilioAlerts || !smsScheduler.twilioAlerts.isEnabled()) {
            return { success: false, error: 'Twilio not configured. Please check your Twilio credentials in settings.' };
        }
        
        if (!recipientNumber) {
            return { success: false, error: 'Recipient number is required' };
        }
        
        if (!message) {
            return { success: false, error: 'Message is required' };
        }
        
        const testMessage = `[TEST] ${message}`;
        const result = await smsScheduler.twilioAlerts.sendCustomAlert(testMessage, recipientNumber, 'sms');
        
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Log that SMS handlers are registered
console.log('✓ SMS Scheduler IPC handlers registered');
