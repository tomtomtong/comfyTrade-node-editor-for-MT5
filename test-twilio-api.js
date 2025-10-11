// Test script to verify Twilio API methods are available
// Run this in the browser console after the app loads

console.log('=== Twilio API Test ===');

// Check if mt5API exists
if (typeof window.mt5API === 'undefined') {
  console.error('❌ window.mt5API is not defined!');
} else {
  console.log('✓ window.mt5API exists');
  
  // Check for Twilio methods
  const methods = [
    'getTwilioConfig',
    'updateTwilioConfig',
    'sendTwilioAlert'
  ];
  
  methods.forEach(method => {
    if (typeof window.mt5API[method] === 'function') {
      console.log(`✓ window.mt5API.${method} is available`);
    } else {
      console.error(`❌ window.mt5API.${method} is NOT available`);
    }
  });
  
  // List all available methods
  console.log('\nAll available mt5API methods:');
  console.log(Object.keys(window.mt5API));
}

console.log('=== Test Complete ===');
