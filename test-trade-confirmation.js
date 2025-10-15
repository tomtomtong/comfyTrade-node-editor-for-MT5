// Test Trade Confirmation Dialog
// This file can be loaded in the browser console to test the confirmation dialog

// Test function to simulate trade confirmation dialog
window.testTradeConfirmation = function(symbol = 'EURUSD', type = 'BUY', volume = 0.1, stopLoss = 0, takeProfit = 0) {
  console.log('=== TESTING TRADE CONFIRMATION DIALOG ===');
  console.log(`Testing with: ${symbol}, ${type}, ${volume}, SL: ${stopLoss}, TP: ${takeProfit}`);
  
  // Check if functions exist
  if (typeof showTradeConfirmationModal !== 'function') {
    console.error('❌ showTradeConfirmationModal function not found!');
    return false;
  }
  
  if (typeof openTradingViewForSymbol !== 'function') {
    console.error('❌ openTradingViewForSymbol function not found!');
    return false;
  }
  
  // Check if modal exists
  const modal = document.getElementById('tradeConfirmationModal');
  if (!modal) {
    console.error('❌ Trade confirmation modal not found in DOM!');
    return false;
  }
  
  console.log('✓ All required functions and elements found');
  
  // Test the confirmation dialog
  try {
    showTradeConfirmationModal(symbol, type, volume, stopLoss, takeProfit);
    console.log('✓ Trade confirmation modal opened successfully');
    
    // Check if modal is visible
    if (modal.classList.contains('show')) {
      console.log('✓ Modal is visible');
    } else {
      console.error('❌ Modal is not visible');
      return false;
    }
    
    // Check if data is populated
    const symbolEl = document.getElementById('confirmTradeSymbol');
    const typeEl = document.getElementById('confirmTradeType');
    const volumeEl = document.getElementById('confirmTradeVolume');
    
    if (symbolEl.textContent === symbol) {
      console.log('✓ Symbol populated correctly:', symbolEl.textContent);
    } else {
      console.error('❌ Symbol not populated correctly. Expected:', symbol, 'Got:', symbolEl.textContent);
    }
    
    if (typeEl.textContent === type.toUpperCase()) {
      console.log('✓ Trade type populated correctly:', typeEl.textContent);
    } else {
      console.error('❌ Trade type not populated correctly. Expected:', type.toUpperCase(), 'Got:', typeEl.textContent);
    }
    
    if (volumeEl.textContent == volume) {
      console.log('✓ Volume populated correctly:', volumeEl.textContent);
    } else {
      console.error('❌ Volume not populated correctly. Expected:', volume, 'Got:', volumeEl.textContent);
    }
    
    // Check if pending trade data is stored
    if (window.pendingTradeData) {
      console.log('✓ Pending trade data stored:', window.pendingTradeData);
    } else {
      console.error('❌ Pending trade data not stored');
    }
    
    console.log('=== TEST COMPLETED ===');
    console.log('💡 To close the modal: hideTradeConfirmationModal()');
    console.log('💡 To test confirmation: confirmTradeExecution() (requires MT5 connection)');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error testing trade confirmation:', error);
    return false;
  }
};

// Test different trade types
window.testBuyTrade = () => testTradeConfirmation('EURUSD', 'BUY', 0.1, 1.0500, 1.1000);
window.testSellTrade = () => testTradeConfirmation('GBPUSD', 'SELL', 0.2, 1.2700, 1.2500);
window.testGoldTrade = () => testTradeConfirmation('XAUUSD', 'BUY', 0.01, 2000, 2100);

// Test modal closing
window.testModalClose = function() {
  console.log('Testing modal close functionality...');
  
  if (typeof hideTradeConfirmationModal === 'function') {
    hideTradeConfirmationModal();
    console.log('✓ Modal close function called');
    
    const modal = document.getElementById('tradeConfirmationModal');
    if (modal && !modal.classList.contains('show')) {
      console.log('✓ Modal is now hidden');
      return true;
    } else {
      console.error('❌ Modal is still visible');
      return false;
    }
  } else {
    console.error('❌ hideTradeConfirmationModal function not found');
    return false;
  }
};

// Test TradingView integration
window.testTradingViewOnly = function(symbol = 'EURUSD') {
  console.log(`Testing TradingView integration for ${symbol}...`);
  
  if (typeof openTradingViewForSymbol === 'function') {
    openTradingViewForSymbol(symbol);
    console.log('✓ TradingView function called');
    return true;
  } else {
    console.error('❌ openTradingViewForSymbol function not found');
    return false;
  }
};

console.log('Trade Confirmation Test Functions Loaded:');
console.log('• window.testTradeConfirmation(symbol, type, volume, sl, tp) - Test confirmation dialog');
console.log('• window.testBuyTrade() - Test BUY trade confirmation');
console.log('• window.testSellTrade() - Test SELL trade confirmation');
console.log('• window.testGoldTrade() - Test Gold trade confirmation');
console.log('• window.testModalClose() - Test modal closing');
console.log('• window.testTradingViewOnly(symbol) - Test TradingView opening only');
console.log('');
console.log('Quick test: window.testBuyTrade()');