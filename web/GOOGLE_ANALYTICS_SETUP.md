# Google Analytics Setup Guide

This guide explains how to set up Google Analytics 4 (GA4) tracking for the ComfyTrade web demo.

## Step 1: Create Google Analytics Account

1. Go to [Google Analytics](https://analytics.google.com/)
2. Sign in with your Google account
3. Click "Start measuring"
4. Create an account name (e.g., "ComfyTrade")
5. Choose data sharing settings

## Step 2: Set Up Property

1. Create a property name (e.g., "ComfyTrade Web Demo")
2. Select your time zone and currency
3. Choose "Web" as the platform
4. Enter your website URL: `https://ai-trade-agent.com`
5. Enter stream name: "ComfyTrade Demo"

## Step 3: Get Your Measurement ID

1. After creating the property, you'll see a **Measurement ID** that looks like: `G-XXXXXXXXXX`
2. Copy this ID

## Step 4: Configure Tracking

1. Open `web/public/ga-config.js`
2. Replace `'GA_MEASUREMENT_ID'` with your actual Measurement ID:

```javascript
const GA_CONFIG = {
  measurementId: 'G-XXXXXXXXXX', // Replace with your actual GA4 ID
  // ... rest of config
};
```

## Step 5: Verify Installation

1. Deploy your changes
2. Visit your website
3. In Google Analytics, go to "Realtime" reports
4. You should see your visit appear within a few minutes

## What Gets Tracked

The implementation tracks these events:

### Automatic Events
- **page_view**: When the demo loads
- **user_engagement**: Session duration when user leaves

### Demo Interactions
- **demo_connect**: User clicks "Connect Demo"
- **demo_trade**: User opens trade modal
- **demo_strategy**: User runs a strategy
- **demo_node_add**: User adds nodes to canvas
- **modal_open**: User opens any modal

### External Links
- **external_link**: Clicks to GitHub, downloads, email
  - Tracks which external links are most popular

### Custom Dimensions
- Demo version tracking
- User type classification

## Privacy Compliance

The configuration includes privacy-friendly settings:
- IP anonymization enabled
- Google Signals disabled
- Ad personalization disabled
- 2-year cookie expiration

## Viewing Reports

In Google Analytics, you can view:

1. **Realtime**: Live user activity
2. **Acquisition**: How users find your demo
3. **Engagement**: Which features users interact with most
4. **Events**: Custom event tracking (demo interactions)

## Custom Reports

Create custom reports to track:
- Most used node types
- Conversion from demo to GitHub
- User engagement with different features
- Geographic distribution of users

## Troubleshooting

### No Data Appearing
1. Check that your Measurement ID is correct in `ga-config.js`
2. Verify the website URL in GA4 matches your deployment URL
3. Check browser console for any JavaScript errors
4. Wait up to 24 hours for data to appear in standard reports

### Events Not Tracking
1. Open browser developer tools
2. Check console for "GA Event" logs
3. Verify event names match the configuration
4. Test in an incognito window to avoid ad blockers

## Development Mode

When `measurementId` is not set or equals `'GA_MEASUREMENT_ID'`, the system runs in development mode:
- Events are logged to console instead of sent to GA
- No actual tracking occurs
- Useful for testing event triggers

## Environment Variables (Optional)

For better security, you can use environment variables:

1. Set `GA_MEASUREMENT_ID` environment variable
2. Modify `ga-config.js` to use: `process.env.GA_MEASUREMENT_ID`
3. This keeps your tracking ID out of public code

## GDPR Compliance

For EU users, consider adding:
1. Cookie consent banner
2. Opt-out mechanism
3. Privacy policy updates
4. Data retention settings in GA4

The current configuration is privacy-friendly but may need additional consent mechanisms depending on your jurisdiction.