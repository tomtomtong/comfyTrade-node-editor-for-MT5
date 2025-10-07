const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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
