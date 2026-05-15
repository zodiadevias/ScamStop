# ScamStop — User Manual

**Version:** 1.0.0  
**Developed by:** Team Ambergris  
**In partnership with:** Philippine National Police (PNP)  
**Coverage:** Olongapo City and surrounding areas  

---

## Table of Contents

1. [What is ScamStop?](#1-what-is-scamstop)
2. [Installation](#2-installation)
3. [First Launch and Onboarding](#3-first-launch-and-onboarding)
4. [Interface Overview](#4-interface-overview)
5. [Home — Real-Time Scanner](#5-home--real-time-scanner)
6. [Report a Scam](#6-report-a-scam)
7. [Check Report Status](#7-check-report-status)
8. [Analytics](#8-analytics)
9. [Settings](#9-settings)
10. [About](#10-about)
11. [How the Detection Engine Works](#11-how-the-detection-engine-works)
12. [Supported Platforms](#12-supported-platforms)
13. [Risk Levels Explained](#13-risk-levels-explained)
14. [Privacy and Your Data](#14-privacy-and-your-data)
15. [Frequently Asked Questions](#15-frequently-asked-questions)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What is ScamStop?

ScamStop is a browser extension that automatically scans content on social media platforms, messaging apps, and email for scam activity — in real time, as you browse. It uses a hybrid AI engine combining Natural Language Processing (NLP) and Locality-Sensitive Hashing (LSH) to detect suspicious messages, phishing links, and fraudulent content.

When a scam is detected, ScamStop places a visible risk badge directly on the flagged content so you can identify threats without leaving the page.

Beyond detection, ScamStop lets you formally report scams to help protect other users and contribute intelligence to the Philippine National Police Anti-Cybercrime Group (PNP-ACG).

---

## 2. Installation

### From the Chrome Web Store

1. Open **Google Chrome** and go to the [Chrome Web Store](https://chrome.google.com/webstore).
2. Search for **"ScamStop"**.
3. Click **Add to Chrome**.
4. In the confirmation dialog, click **Add extension**.
5. The ScamStop shield icon will appear in your browser toolbar.

> **Tip:** If the icon is hidden, click the puzzle piece icon (🧩) in the toolbar and pin ScamStop for easy access.

### Manual Installation (Developer / Sideload)

1. Download or build the extension package (the `dist/ScamStop/browser` folder).
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `dist/ScamStop/browser` folder.
6. ScamStop will appear in your extensions list and toolbar.

---

## 3. First Launch and Onboarding

When you open ScamStop for the first time by clicking the toolbar icon, you will see the **Getting Started** screen.

```
┌─────────────────────────────┐
│        [ScamStop Logo]      │
│                             │
│      [ Get Started ]        │
│                             │
│  By proceeding, you agree   │
│  to our Terms and           │
│  Conditions                 │
│                             │
│  [PNP Seal]                 │
│  In partnership with the    │
│  Philippine National Police │
└─────────────────────────────┘
```

- Click **"Get Started"** to proceed to the main application.
- Click **"Terms and Conditions"** (underlined) to read the full terms before proceeding.
- This screen only appears once. On subsequent opens, ScamStop goes directly to the Home screen.

> To see the onboarding screen again, go to **About → Reset Onboarding**.

---

## 4. Interface Overview

ScamStop's popup has five sections accessible via the bottom navigation bar:

| Icon | Section | Purpose |
|------|---------|---------|
| 🏠 Home | Dashboard | Scanner toggle, stats, recent detections |
| 📄 Report | Report Form | Submit a formal scam report |
| 📊 Analytics | Analytics | Community stats and model performance |
| ⚙️ Settings | Settings | Theme, preferences |
| ℹ️ About | About | App info, version, legal |

---

## 5. Home — Real-Time Scanner

The Home screen is the main control center for ScamStop's real-time scanning feature.

### 5.1 Scanner Toggle

```
┌─────────────────────────────┐
│                             │
│      [Shield Image]         │
│   Real-time Scan is ON      │
│      [ Turn OFF ]           │
│                             │
└─────────────────────────────┘
```

- **Turn ON** — ScamStop begins scanning content on every page you visit. A shield animation plays to confirm the change.
- **Turn OFF** — Scanning stops and all risk badges are removed from the current page.

Your scanning preference is saved automatically and persists across browser sessions.

### 5.2 Statistics Cards

Three cards below the shield show your personal scanning statistics:

| Card | Description |
|------|-------------|
| **Scanned** | Total number of content elements analyzed since installation |
| **Flagged** | Number of items identified as potential scams |
| **Safe** | Number of items confirmed as safe |

### 5.3 Recent Detections

The **Recent Detections** list shows the last 10 flagged items from your browsing session. Each entry displays:

- A **colored risk bar** on the left (red = high, yellow = medium, green = low)
- A **preview** of the flagged message (first 60 characters)
- The **date** it was detected
- The **platform** (website hostname)
- A **risk percentage badge**

Click any detection to open the **Detection Detail Modal**, which shows:
- Full message text
- Risk score
- Date and platform
- A **Report** button to formally submit the item as a scam report

---

## 6. Report a Scam

The Report screen lets you formally submit a scam incident. Reports are stored securely and may be shared with the PNP-ACG for investigation.

### 6.1 Filling Out the Form

The form is divided into three sections:

#### Victim Information *(required)*

| Field | Description |
|-------|-------------|
| **Victim's Name** | Full name of the person who was targeted or victimized |
| **Type of Scam** | Select from the dropdown (see scam types below) |
| **City / Location** | Auto-detected from your IP address or GPS. You can type or select a different city manually |

**Available Scam Types:**
- Online Selling Scam
- Investment Fraud
- Text Scam
- Love Scam
- Phishing
- Job Offer Scam
- Lottery / Prize Scam
- Tech Support Scam
- Identity Theft
- Child Predator
- Other

#### Suspect Information *(optional)*

| Field | Description |
|-------|-------------|
| **Suspect Name / Alias** | Name or alias used by the scammer |
| **Suspect Contact** | Phone number, email address, or social media handle |
| **Amount Lost (PHP)** | Monetary amount lost, if any |

#### Incident Details *(required)*

| Field | Description |
|-------|-------------|
| **Describe the scam** | Paste the suspicious message, URL, or describe what happened in detail |
| **Suspicious URL** | The website or link involved in the scam (optional) |
| **Screenshot / Evidence** | Attach an image (JPG, PNG) or PDF file as evidence (optional) |

### 6.2 Privacy Consent

Before submitting, you must read and accept the **Privacy Notice**:

1. Click the **"Privacy Notice"** link in the consent section.
2. Read the full notice explaining what data is collected and how it is used.
3. Click **"I Understand and Consent"** — this automatically checks the consent checkbox.
4. Alternatively, check the checkbox manually after reading.

> The Submit button remains disabled until consent is given.

### 6.3 Submitting the Report

Click **Submit Report**. You will receive:
- A **success message** confirming submission
- A **Report ID** (e.g., `aB3xK9mNpQ2rT7uV`) — **save this ID** to check your report's status later

> Reports go directly to the secure Firestore database. Submission is typically instant.

---

## 7. Check Report Status

At the top of the Report screen is the **Check Report Status** section.

### How to Check

1. Enter your **Report ID** in the input field.
2. Press **Enter** or click **Check**.
3. Your report details will appear below.

### Status Meanings

| Status | Color | Meaning |
|--------|-------|---------|
| **Under Review** | 🟡 Yellow | Your report has been received and is awaiting review |
| **Verified** | 🟢 Green | The report has been confirmed as a scam by the review team |
| **Rejected** | 🔴 Red | The report did not meet the criteria for a scam report |
| **Under Investigation** | 🟣 Purple | The case has been escalated and is actively being investigated |
| **Resolved** | 🔵 Blue | The case has been resolved |
| **Unresolved** | 🟠 Orange | The case could not be resolved at this time |

### Admin Reply

If the review team has responded to your report, an **Admin Reply** section will appear below the status details, showing the message and the date it was sent.

---

## 8. Analytics

The Analytics screen shows community-wide data and AI model performance metrics.

### 8.1 Report Statistics

| Chart | Description |
|-------|-------------|
| **Reports per Day** | Bar chart of submissions over the last 7 days (Mon–Sun) |
| **Reports by City** | Top 10 Philippine cities by number of reports submitted |
| **Reports by Scam Type** | Breakdown of all reported scam categories, sorted by frequency |

A **Total Reports** counter at the top shows the cumulative number of reports in the system.

### 8.2 Model Performance

The **NLP / LSH Model Performance** chart shows live metrics from the AI detection engine:

| Metric | What it means |
|--------|--------------|
| **Accuracy** | Overall percentage of correct predictions |
| **Precision** | Of all items flagged as scams, how many actually were |
| **Recall** | Of all actual scams, how many were correctly caught |
| **F1-Score** | Balanced average of Precision and Recall |
| **AUC-ROC** | Model's ability to distinguish scam from non-scam across all thresholds |

Higher percentages indicate better model performance. The model is retrained weekly using community-submitted reports.

---

## 9. Settings

### Light Mode

Toggle between **Dark Mode** (default) and **Light Mode** for the extension popup.

- Click the **ON / OFF** button next to "Light Mode" to switch.
- The preference is saved automatically.

### About

Click **Go** to navigate to the About screen.

---

## 10. About

The About screen provides information about ScamStop.

| Section | Content |
|---------|---------|
| **Mission** | ScamStop's purpose and approach |
| **What ScamStop Provides** | Feature cards describing key capabilities |
| **Partnerships and Team** | PNP partnership and Team Ambergris |
| **Terms and Conditions** | Opens the full Terms modal |
| **Reset Onboarding** | Clears the "seen" flag so the Getting Started screen appears on next open |
| **Version** | Current app version (v1.0.0) |
| **Coverage** | Olongapo City |

---

## 11. How the Detection Engine Works

ScamStop uses a **three-tier hybrid detection system**:

### Tier 1 — Keyword Match
The fastest check. A curated list of known scam keywords is checked against the message. If a match is found, the content is immediately flagged with **99% risk** and labeled **"Keyword"**.

### Tier 2 — LSH Near-Duplicate Detection
Locality-Sensitive Hashing (LSH) compares the message against a database of previously reported scam messages using MinHash fingerprints. If the message is structurally similar to a known scam (above the similarity threshold), it is flagged with **99% risk** and labeled **"LSH"**.

### Tier 3 — NLP Classifier
If the message passes the first two tiers, a TF-IDF vectorizer and Multinomial Naive Bayes classifier analyze the text. The model outputs a **scam probability score (0–100%)**. Messages scoring above **70%** are flagged and labeled **"NLP"**.

### Risk Badge Labels

When content is flagged on a page, the badge shows:
```
RISK: 92% · NLP
RISK: 99% · LSH
RISK: 99% · Keyword
```

Click the badge to open the **Analysis Modal**, which shows the full message text, risk score, detection method, and any links found in the content.

---

## 12. Supported Platforms

ScamStop's real-time scanner is optimized for the following platforms:

| Platform | What is scanned |
|----------|----------------|
| **Facebook** | Posts, comments, and messages in your feed |
| **Instagram** | Posts and captions |
| **Twitter / X** | Tweets in your timeline |
| **Gmail** | Email message bodies |
| **Telegram (Web)** | Messages in chats and channels |
| **All other websites** | Article and post content (`<article>` elements) |

> ScamStop also extracts and analyzes **links embedded in messages**, unwrapping Facebook redirect URLs (e.g., `l.facebook.com/l.php`) to reveal the actual destination domain.

---

## 13. Risk Levels Explained

| Level | Score Range | Badge Color | Meaning |
|-------|-------------|-------------|---------|
| **High Risk** | 70% – 100% | 🔴 Red | Strong indicators of a scam. Do not engage with this content. |
| **Medium Risk** | 40% – 69% | 🟡 Yellow | Suspicious content. Proceed with caution and verify independently. |
| **Low Risk** | 0% – 39% | 🟢 Green | Likely safe, but always use your own judgment. |

> ScamStop is an advisory tool. It does not guarantee that all flagged content is a scam, or that all unflagged content is safe. Always verify independently before sending money or personal information.

---

## 14. Privacy and Your Data

ScamStop is designed in compliance with **Republic Act No. 10173 — Data Privacy Act of 2012**.

### What data is collected

| Data | When | Purpose |
|------|------|---------|
| Page text content | During real-time scanning | Sent to AI server for analysis; not stored unless you submit a report |
| Victim name, city, scam description | When you submit a report | Stored in secure database for investigation |
| Suspect name and contact | When you submit a report (optional) | Assists law enforcement investigation |
| Evidence files | When you attach a file | Stored securely via Uploadcare |
| Approximate city (IP-based) | When you open the Report form | Pre-fills the city field only |

### What is NOT collected

- Your identity as the person submitting a report is kept confidential
- ScamStop does not collect passwords, financial credentials, or login information
- Scanned page content is not stored unless you explicitly submit a report

### Data sharing

Verified reports may be shared with the **Philippine National Police Anti-Cybercrime Group (PNP-ACG)** for law enforcement purposes.

### Your rights

Under RA 10173, you have the right to access, correct, erase, and object to the processing of your personal data. Use your Report ID to identify your submission and contact the team via the About page.

### Retention

Reports are retained for a maximum of **3 years** from submission, after which personal identifiers are anonymized or deleted.

---

## 15. Frequently Asked Questions

**Q: Does ScamStop read all my messages?**  
A: ScamStop reads the visible text content of posts and messages on supported platforms to check for scam patterns. This content is sent to the ScamStop AI server for analysis. It is not stored unless you submit a formal report.

**Q: Can I use ScamStop without an internet connection?**  
A: No. The AI detection engine runs on a remote server and requires an internet connection to analyze content.

**Q: Why does the scanner sometimes show a risk badge on legitimate content?**  
A: The AI model is not perfect. Legitimate messages that use language similar to known scams may occasionally be flagged (false positives). Always use your own judgment. You can turn off scanning at any time from the Home screen.

**Q: What should I do if I receive a high-risk warning?**  
A: Do not click any links, reply, or send money. You can click the risk badge to see the full analysis, then use the **Report** button to formally submit the incident.

**Q: How do I find my Report ID after submitting?**  
A: Your Report ID is shown on screen immediately after a successful submission. It looks like `aB3xK9mNpQ2rT7uV`. Write it down or take a screenshot — it cannot be recovered if lost.

**Q: How long does it take for my report to be reviewed?**  
A: Review times vary. You can check the status at any time using your Report ID in the "Check Report Status" section of the Report screen.

**Q: Can I delete a report I submitted?**  
A: To request deletion of your report, contact the team via the About page and provide your Report ID.

**Q: Why is the extension slow to respond sometimes?**  
A: The AI server may be in a sleep state if it has not been used recently (free hosting tier). The first request after a period of inactivity may take 10–30 seconds to wake the server. Subsequent requests will be fast.

**Q: Does ScamStop work on mobile?**  
A: ScamStop is a browser extension and works on desktop Chrome. It is not available as a standalone mobile app.

---

## 16. Troubleshooting

### Scanner is not showing badges on Facebook/Instagram

- Make sure the scanner is **ON** (check the Home screen shield).
- Refresh the page after enabling the scanner.
- Some content may load dynamically — scroll down to trigger scanning of new posts.

### "Could not retrieve report" error when checking status

- Double-check that you entered the Report ID exactly as shown (it is case-sensitive).
- Ensure you have an active internet connection.
- Try again after a few seconds — the server may be waking up.

### Report submission fails

- Check your internet connection.
- Make sure all required fields (Victim's Name, Type of Scam, Description) are filled in.
- Ensure the Privacy Notice consent checkbox is checked.
- If attaching a file, ensure it is an image (JPG/PNG) or PDF and is not corrupted.

### Analytics shows "No data"

- Analytics data is loaded from the community database. If no reports have been submitted yet, charts will be empty.
- Click **Retry** if an error message appears.

### Extension popup is blank or not loading

- Go to `chrome://extensions`, find ScamStop, and click the **reload** (↺) button.
- If the issue persists, remove and reinstall the extension.

### Light mode / dark mode not saving

- The theme preference is stored in your browser's local storage. Clearing browser data will reset it to dark mode (default).

---

*ScamStop User Manual — © 2026 Team Ambergris. All Rights Reserved.*  
*Developed for the community of Olongapo City in partnership with the Philippine National Police.*
