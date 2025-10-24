const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const MT5Bridge = require('./mt5-bridge');

let mainWindow;
let mt5Bridge;

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

ipcMain.handle('mt5:callLLM', async (event, params) => {
    try {
        const result = await mt5Bridge.callLLM(params);
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
        return { success: true };
    } catch (error) {
        throw error;
    }
});
