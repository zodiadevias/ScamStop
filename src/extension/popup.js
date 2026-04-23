// ScamStop Popup Script
// Handles popup UI interactions

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadBlacklist();
    
    // Sync button
    document.getElementById('syncBtn').addEventListener('click', syncWithApp);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
});

// Load statistics
function loadStats() {
    chrome.storage.local.get(['detections', 'reports', 'blacklist'], (result) => {
        const detections = result.detections || [];
        const reports = result.reports || [];
        const blacklist = result.blacklist || [];
        
        document.getElementById('detectionCount').textContent = detections.length;
        document.getElementById('reportCount').textContent = reports.length;
        document.getElementById('blacklistCount').textContent = blacklist.length;
    });
}

// Load blacklist
function loadBlacklist() {
    chrome.storage.local.get(['blacklist'], (result) => {
        const blacklist = result.blacklist || [];
        const container = document.getElementById('blacklistContainer');
        
        if (blacklist.length === 0) {
            container.innerHTML = '<div class="empty-state">No blacklisted numbers yet</div>';
            return;
        }
        
        container.innerHTML = blacklist.map(entry => `
            <div class="blacklist-item">
                <span class="blacklist-number">${entry.number}</span>
                <button class="blacklist-remove" data-number="${entry.number}">×</button>
            </div>
        `).join('');
        
        // Add remove listeners
        container.querySelectorAll('.blacklist-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                removeFromBlacklist(e.target.dataset.number);
            });
        });
    });
}

// Remove from blacklist
function removeFromBlacklist(number) {
    chrome.storage.local.get(['blacklist'], (result) => {
        const blacklist = result.blacklist || [];
        const updated = blacklist.filter(e => e.number !== number);
        chrome.storage.local.set({ blacklist: updated }, () => {
            loadBlacklist();
            loadStats();
        });
    });
}

// Sync with ScamStop app
function syncWithApp() {
    // Get data from localStorage (from the web app)
    const appBlacklist = JSON.parse(localStorage.getItem('scamstop_blacklist') || '[]');
    const appReports = JSON.parse(localStorage.getItem('scamstop_reports') || '[]');
    
    // Merge with extension storage
    chrome.storage.local.get(['blacklist', 'reports'], (result) => {
        const extBlacklist = result.blacklist || [];
        const extReports = result.reports || [];
        
        // Merge blacklists (avoid duplicates)
        appBlacklist.forEach(entry => {
            if (!extBlacklist.find(e => e.number === entry.number)) {
                extBlacklist.push(entry);
            }
        });
        
        // Merge reports
        appReports.forEach(report => {
            extReports.push(report);
        });
        
        // Save merged data
        chrome.storage.local.set({
            blacklist: extBlacklist,
            reports: extReports
        }, () => {
            loadBlacklist();
            loadStats();
            alert('Synced successfully!');
        });
    });
}

// Clear all data
function clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        chrome.storage.local.clear(() => {
            loadBlacklist();
            loadStats();
            alert('All data cleared!');
        });
    }
}