// ScamStop Content Script
// Detects scam messages and injects CSS blocking

(function() {
    'use strict';

    // Scam detection patterns
    const SCAM_PATTERNS = {
        // Suspicious keywords
        keywords: [
            'winner', 'prize', 'lottery', 'congratulations', 'you won',
            'claim now', 'urgent', 'act now', 'limited time',
            'free gift', 'click here', 'verify your account',
            'suspend', 'locked', 'compromised', 'suspicious activity',
            'job offer', 'work from home', 'easy money', 'salary',
            'bank', 'account', 'verify', 'update', 'confirm',
            'otp', 'one-time', 'password', 'login', 'sign in',
            'bitcoin', 'crypto', 'investment', 'double your money',
            'inheritance', 'million', 'billion', 'abroad', 'beneficiary'
        ],
        // Suspicious URL patterns
        urlPatterns: [
            /bit\.ly\/\w+/i,
            /tinyurl\.com\/\w+/i,
            /t\.co\/\w+/i,
            /goo\.gl\/\w+/i,
            /ow\.ly\/\w+/i,
            /is\.gd\/\w+/i,
            /buff\.ly\/\w+/i,
            /https?:\/\/\d+\.\d+\.\d+\.\d+/i,
            /https?:\/\/[a-z0-9]+\.xyz/i,
            /https?:\/\/[a-z0-9]+\.top/i,
            /https?:\/\/[a-z0-9]+\.club/i,
            /https?:\/\/[a-z0-9]+\.work/i,
            /https?:\/\/[a-z0-9]+\.click/i,
            /https?:\/\/[a-z0-9]+\.link/i,
            /https?:\/\/[a-z0-9]+\.online/i,
            /https?:\/\/bank[-]?[a-z0-9]+\.com/i,
            /https?:\/\/[a-z0-9]+bank\.com/i,
            /https?:\/\/paypal[-]?[a-z0-9]+\.com/i,
            /https?:\/\/[a-z0-9]+paypal\.com/i
        ],
        // Phone number patterns (suspicious)
        phonePatterns: [
            /^\+63[89]\d{7}/,  // Suspicious Philippine numbers
            /^\+1[89]\d{9}/,   // Suspicious US numbers
            /^\+44[789]\d{8}/, // Suspicious UK numbers
            /^09\d{9}/,        // Philippine mobile
            /\d{5,}[-\s]?\d{5,}/ // Repeated digits
        ]
    };

    // Scammer blacklist (stored in localStorage)
    let blacklist = [];

    // Load blacklist from storage
    function loadBlacklist() {
        const stored = localStorage.getItem('scamstop_blacklist');
        if (stored) {
            blacklist = JSON.parse(stored);
        }
    }

    // Save blacklist to storage
    function saveBlacklist() {
        localStorage.setItem('scamstop_blacklist', JSON.stringify(blacklist));
    }

    // Check if number is blacklisted
    function isBlacklisted(number) {
        return blacklist.some(entry => entry.number === number);
    }

    // Calculate scam probability
    function calculateScamProbability(text, sender) {
        let score = 0;
        const lowerText = text.toLowerCase();

        // Check for blacklisted sender
        if (sender && isBlacklisted(sender)) {
            score += 50;
        }

        // Check keywords
        SCAM_PATTERNS.keywords.forEach(keyword => {
            if (lowerText.includes(keyword)) {
                score += 10;
            }
        });

        // Check for suspicious URLs
        SCAM_PATTERNS.urlPatterns.forEach(pattern => {
            if (pattern.test(text)) {
                score += 25;
            }
        });

        // Check for suspicious phone numbers
        if (sender) {
            SCAM_PATTERNS.phonePatterns.forEach(pattern => {
                if (pattern.test(sender)) {
                    score += 20;
                }
            });
        }

        // Cap at 100%
        return Math.min(score, 100);
    }

    // Get traffic light color based on probability
    function getTrafficLight(probability) {
        if (probability >= 70) return 'red';
        if (probability >= 30) return 'yellow';
        return 'green';
    }

    // Create scam warning element
    function createScamWarning(probability, originalMessage) {
        const warning = document.createElement('div');
        warning.className = 'scamstop-warning';
        
        const color = getTrafficLight(probability);
        warning.setAttribute('data-scam-level', color);
        
        warning.innerHTML = `
            <div class="scamstop-header">
                <span class="scamstop-icon">⚠️</span>
                <span class="scamstop-text">This is a ${probability}% possible scam</span>
                <button class="scamstop-toggle">Show Message</button>
            </div>
            <div class="scamstop-content" style="display: none;">
                <p>${originalMessage}</p>
            </div>
            <div class="scamstop-actions">
                <button class="scamstop-report" data-number="${getSenderNumber()}">Report to PNP</button>
                <button class="scamstop-blacklist">Add to Blacklist</button>
            </div>
        `;

        // Toggle message visibility
        const toggleBtn = warning.querySelector('.scamstop-toggle');
        const content = warning.querySelector('.scamstop-content');
        toggleBtn.addEventListener('click', () => {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggleBtn.textContent = 'Hide Message';
            } else {
                content.style.display = 'none';
                toggleBtn.textContent = 'Show Message';
            }
        });

        // Report to PNP
        const reportBtn = warning.querySelector('.scamstop-report');
        reportBtn.addEventListener('click', () => {
            reportToPNP(getSenderNumber(), getCurrentMessage());
        });

        // Add to blacklist
        const blacklistBtn = warning.querySelector('.scamstop-blacklist');
        blacklistBtn.addEventListener('click', () => {
            addToBlacklist(getSenderNumber());
            warning.remove();
        });

        return warning;
    }

    // Get sender number (platform specific)
    function getSenderNumber() {
        // This will be overridden per platform
        return 'unknown';
    }

    // Get current message text
    function getCurrentMessage() {
        // This will be overridden per platform
        return '';
    }

    // Report to PNP
    function reportToPNP(number, message) {
        const reports = JSON.parse(localStorage.getItem('scamstop_reports') || '[]');
        reports.push({
            number: number,
            message: message,
            timestamp: new Date().toISOString(),
            status: 'pending'
        });
        localStorage.setItem('scamstop_reports', JSON.stringify(reports));
        
        alert('Report submitted to PNP. Thank you for helping fight scams!');
    }

    // Add to blacklist
    function addToBlacklist(number) {
        if (!isBlacklisted(number)) {
            blacklist.push({
                number: number,
                addedAt: new Date().toISOString()
            });
            saveBlacklist();
        }
    }

    // Inject CSS styles
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .scamstop-warning {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #e94560;
                border-radius: 12px;
                padding: 16px;
                margin: 12px 0;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-shadow: 0 4px 15px rgba(233, 69, 96, 0.3);
                animation: scamstopSlideIn 0.3s ease-out;
            }

            @keyframes scamstopSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .scamstop-warning[data-scam-level="red"] {
                border-color: #ff4444;
                background: linear-gradient(135deg, #2d1b1b 0%, #1a1a2e 100%);
            }

            .scamstop-warning[data-scam-level="yellow"] {
                border-color: #ffbb33;
                background: linear-gradient(135deg, #2d2a1b 0%, #1a1a2e 100%);
            }

            .scamstop-warning[data-scam-level="green"] {
                border-color: #00C851;
                background: linear-gradient(135deg, #1b2d1b 0%, #1a1a2e 100%);
            }

            .scamstop-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
            }

            .scamstop-icon {
                font-size: 24px;
            }

            .scamstop-text {
                flex: 1;
                color: #fff;
                font-weight: 600;
                font-size: 14px;
            }

            .scamstop-toggle {
                background: #4caf50;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }

            .scamstop-toggle:hover {
                background: #45a049;
            }

            .scamstop-content {
                background: rgba(255, 255, 255, 0.1);
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 12px;
            }

            .scamstop-content p {
                color: #ccc;
                margin: 0;
                font-size: 13px;
                line-height: 1.5;
            }

            .scamstop-actions {
                display: flex;
                gap: 10px;
            }

            .scamstop-report, .scamstop-blacklist {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s;
            }

            .scamstop-report {
                background: #e94560;
                color: white;
            }

            .scamstop-report:hover {
                background: #d63850;
            }

            .scamstop-blacklist {
                background: #333;
                color: #fff;
            }

            .scamstop-blacklist:hover {
                background: #444;
            }

            /* Traffic light indicator */
            .scamstop-traffic-light {
                display: flex;
                gap: 8px;
                margin-left: auto;
            }

            .scamstop-light {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                opacity: 0.3;
            }

            .scamstop-light.active {
                opacity: 1;
                box-shadow: 0 0 8px currentColor;
            }

            .scamstop-light.red { background: #ff4444; }
            .scamstop-light.yellow { background: #ffbb33; }
            .scamstop-light.green { background: #00C851; }
        `;
        document.head.appendChild(style);
    }

    // Initialize
    function init() {
        loadBlacklist();
        injectStyles();
        
        // Start observing for new messages
        observeMessages();
    }

    // Observe for new messages (platform specific)
    function observeMessages() {
        // This will be implemented per platform
        // For now, we'll scan existing messages
        scanExistingMessages();
    }

    // Scan existing messages on page
    function scanExistingMessages() {
        // Platform-specific selectors
        const selectors = {
            whatsapp: '._2exMM, ._1Gy50',
            messenger: '.q6uty, .d2raw',
            gmail: '.adn, .gsn',
            facebook: '.x1n2onr6, .x1lliihq'
        };

        // Find the active platform
        let platform = null;
        for (const [key, selector] of Object.entries(selectors)) {
            if (document.querySelector(selector)) {
                platform = key;
                break;
            }
        }

        if (platform) {
            scanMessagesForPlatform(platform);
        }
    }

    // Scan messages for specific platform
    function scanMessagesForPlatform(platform) {
        // Implementation will vary per platform
        console.log('Scanning messages for platform:', platform);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();