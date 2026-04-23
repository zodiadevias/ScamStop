// ScamStop Background Service Worker
// Handles communication between content scripts and popup

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAM_DETECTED') {
        // Update badge to show warning
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
        
        // Store the detection
        chrome.storage.local.get(['detections'], (result) => {
            const detections = result.detections || [];
            detections.push({
                ...message.data,
                timestamp: new Date().toISOString(),
                url: sender.url
            });
            chrome.storage.local.set({ detections });
        });
    }
    
    if (message.type === 'REPORT_TO_PNP') {
        // Store report for PNP
        chrome.storage.local.get(['reports'], (result) => {
            const reports = result.reports || [];
            reports.push({
                ...message.data,
                timestamp: new Date().toISOString(),
                status: 'pending'
            });
            chrome.storage.local.set({ reports });
        });
        
        sendResponse({ success: true });
    }
    
    if (message.type === 'ADD_TO_BLACKLIST') {
        chrome.storage.local.get(['blacklist'], (result) => {
            const blacklist = result.blacklist || [];
            if (!blacklist.find(e => e.number === message.data.number)) {
                blacklist.push({
                    number: message.data.number,
                    addedAt: new Date().toISOString()
                });
                chrome.storage.local.set({ blacklist });
            }
        });
    }
    
    if (message.type === 'GET_BLACKLIST') {
        chrome.storage.local.get(['blacklist'], (result) => {
            sendResponse(result.blacklist || []);
        });
        return true;
    }
});

// Clear badge when tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.action.setBadgeText({ text: '' });
});

// Listen for tab updates to rescan
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        chrome.action.setBadgeText({ text: '' });
    }
});