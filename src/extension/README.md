# ScamStop Browser Extension

A browser extension that detects scam messages in real-time across popular messaging platforms.

## Features

- **Automatic Scam Detection** - Scans messages for known scam patterns
- **Traffic Light System** - Visual indicators (🔴 High Risk, 🟡 Caution, 🟢 Safe)
- **One-Tap PNP Reporting** - Report suspicious numbers directly to Philippine National Police
- **Scammer Blacklist** - Block and blacklist known scammers
- **Cross-Platform Protection** - Works on WhatsApp, Messenger, Facebook, Gmail, Outlook, Yahoo

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `src/extension` folder

## File Structure

```
extension/
├── manifest.json     # Extension configuration (Manifest V3)
├── content.js        # Content script for message scanning
├── background.js     # Background service worker
├── popup.html        # Extension popup UI
├── popup.js          # Popup interactions
├── injected.css      # CSS injection for blocking
└── icons/            # Extension icons (16, 48, 128px)
```

## How It Works

### Content Script (`content.js`)
- Injects into supported messaging platforms
- Scans messages for scam patterns using keyword, URL, and phone number detection
- Calculates scam probability (0-100%)
- Injects warning UI when scam detected
- Provides "Report to PNP" and "Add to Blacklist" buttons

### Background Service Worker (`background.js`)
- Handles communication between content scripts and popup
- Stores detections, reports, and blacklist data
- Manages extension badge (shows warning indicator)

### Popup UI (`popup.html`)
- Shows detection statistics
- Displays blacklist management
- Provides sync with ScamStop web app
- Traffic light status display

## Scam Detection Patterns

### Keywords
- Prize/lottery scams: "winner", "prize", "lottery", "you won"
- Urgency scams: "urgent", "act now", "limited time"
- Job scams: "job offer", "work from home", "easy money"
- Banking scams: "verify", "account", "suspended", "compromised"
- Investment scams: "bitcoin", "crypto", "investment", "double your money"

### URL Patterns
- Shortened URLs: bit.ly, tinyurl, t.co, goo.gl
- Suspicious TLDs: .xyz, .top, .club, .work, .click, .link, .online
- Fake bank URLs: bank-xxx.com, paypal-xxx.com

### Phone Patterns
- Suspicious Philippine numbers (+6398, +6399)
- Repeated digit patterns

## Adding Icons

The extension requires icon files. Create the following files in `src/extension/icons/`:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

You can use any image editor to create these, or download from a free icon source.

## Data Storage

- **localStorage** (Web App): `scamstop_blacklist`, `scamstop_reports`
- **chrome.storage** (Extension): `blacklist`, `reports`, `detections`

The popup includes a "Sync" button to merge data between the web app and extension.

## Partnership

ScamStop is developed in partnership with the **Philippine National Police (PNP)** to help combat online fraud and scams targeting Filipino citizens.