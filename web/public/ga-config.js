// Google Analytics Configuration
// Replace 'GA_MEASUREMENT_ID' with your actual Google Analytics 4 Measurement ID
// Example: 'G-XXXXXXXXXX'

const GA_CONFIG = {
  // Your GA4 Measurement ID
  measurementId: 'G-NE86NQK0HD', // ComfyTrade Demo GA4 ID
  
  // Custom tracking configuration
  config: {
    // Enhanced ecommerce tracking (useful for conversion tracking)
    send_page_view: true,
    
    // Custom dimensions (optional)
    custom_map: {
      'demo_version': 'custom_parameter_1',
      'user_type': 'custom_parameter_2'
    },
    
    // Cookie settings
    cookie_domain: 'auto',
    cookie_expires: 63072000, // 2 years
    
    // Privacy settings
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  },
  
  // Custom events to track
  events: {
    // Demo interactions
    demo_connect: 'User connected to demo',
    demo_trade: 'User opened trade modal',
    demo_strategy: 'User ran strategy',
    demo_node_add: 'User added node to canvas',
    
    // Navigation
    external_link: 'User clicked external link',
    modal_open: 'User opened modal',
    
    // Engagement
    page_view: 'Page viewed',
    session_start: 'Session started'
  }
};

// Initialize Google Analytics if measurement ID is set
if (GA_CONFIG.measurementId && GA_CONFIG.measurementId !== 'GA_MEASUREMENT_ID') {
  // Load GA4 script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_CONFIG.measurementId}`;
  document.head.appendChild(script);
  
  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', GA_CONFIG.measurementId, GA_CONFIG.config);
  
  // Make gtag available globally
  window.gtag = gtag;
  
  console.log('Google Analytics initialized with ID:', GA_CONFIG.measurementId);
} else {
  console.warn('Google Analytics not initialized. Please set your GA4 Measurement ID in ga-config.js');
  
  // Create dummy gtag function for development
  window.gtag = function() {
    console.log('GA Event (dev mode):', arguments);
  };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GA_CONFIG;
}