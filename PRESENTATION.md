# ScamStop — Technical Presentation Guide

**Project:** ScamStop Browser Extension  
**Team:** Team Ambergris  
**Partner:** Philippine National Police (PNP)  
**Version:** 1.0.0  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Extension Architecture — How the Three Scripts Work Together](#4-extension-architecture)
5. [Real-Time Scanner — Deep Dive](#5-real-time-scanner--deep-dive)
6. [The AI Detection Engine](#6-the-ai-detection-engine)
7. [Report Submission Flow](#7-report-submission-flow)
8. [Data Storage Architecture](#8-data-storage-architecture)
9. [Model Retraining Pipeline](#9-model-retraining-pipeline)
10. [Analytics Pipeline](#10-analytics-pipeline)
11. [Privacy and Compliance](#11-privacy-and-compliance)
12. [End-to-End Request Flow Diagrams](#12-end-to-end-request-flow-diagrams)
13. [Presenting Each Feature](#13-presenting-each-feature)
14. [Anticipated Questions and Answers](#14-anticipated-questions-and-answers)

---

## 1. Project Overview

ScamStop is a **Manifest V3 Chrome browser extension** that performs real-time AI-powered scam detection on web content as users browse social media, email, and messaging platforms. It overlays risk badges directly on suspicious content without requiring the user to do anything.

Beyond passive detection, it provides a structured **scam reporting system** that feeds verified reports to the Philippine National Police Anti-Cybercrime Group (PNP-ACG) and continuously improves the AI model through a weekly retraining pipeline.

### Core Problems Solved

| Problem | ScamStop's Solution |
|---------|-------------------|
| Users cannot identify scam messages in real time | Passive AI scanner overlays risk badges on suspicious content |
| Scam reports are scattered and hard to act on | Structured report form with direct Firestore storage and PNP integration |
| AI models become stale as scam tactics evolve | Automated weekly retraining using community-submitted reports |
| Users have no feedback on submitted reports | Report ID system with live status tracking and admin reply |

---

## 2. System Architecture

ScamStop is composed of four distinct layers that communicate with each other:

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                              │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ content.js   │───▶│background.js │───▶│  Flask API       │  │
│  │ (Page scan)  │    │(Service      │    │  (Render.com)    │  │
│  └──────────────┘    │ Worker)      │    │                  │  │
│                      └──────┬───────┘    │  ScamStopEngine  │  │
│  ┌──────────────┐           │            │  (NLP + LSH)     │  │
│  │ Angular SPA  │───────────┘            └────────┬─────────┘  │
│  │ (Popup UI)   │                                 │            │
│  └──────────────┘                                 │            │
└──────────────────────────────────────────────────┼────────────┘
                                                   │
                              ┌────────────────────▼──────────────┐
                              │         Google Firebase            │
                              │                                    │
                              │  Firestore DB   (reports,          │
                              │                  lsh_index,        │
                              │                  keywords,         │
                              │                  stats)            │
                              └───────────────────────────────────┘
```

### The Four Layers

1. **`content.js`** — Injected into every webpage. Scans DOM elements, extracts text and links, sends to background for scoring, renders badges.
2. **`background.js`** — Service worker. Acts as the message broker between content script and the API. Manages local storage for stats and detections.
3. **Angular SPA (Popup)** — The extension popup UI built with Angular 21. Communicates with the background script via `chrome.runtime.sendMessage`.
4. **Flask API (`server.py`)** — Python backend hosted on Render.com. Runs the `ScamStopEngine` model, manages Firestore, handles retraining.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension UI | Angular 21 (standalone components, signals) | Popup interface |
| Extension runtime | Chrome Extension Manifest V3 | Browser integration |
| Content scanning | Vanilla JavaScript | DOM manipulation, badge injection |
| AI backend | Python 3.11, Flask, Gunicorn | REST API, model serving |
| ML model | scikit-learn (TF-IDF + Multinomial Naive Bayes) | NLP classification |
| Similarity search | datasketch (MinHash LSH) | Near-duplicate detection |
| Database | Google Firestore | Reports, LSH index, keywords, stats |
| File storage | Uploadcare | Evidence file uploads |
| Hosting | Render.com (free tier) | API deployment |
| Rate limiting | Flask-Limiter | DDoS and abuse protection |

---

## 4. Extension Architecture

A Chrome extension has three isolated JavaScript contexts that cannot share memory directly. ScamStop uses Chrome's messaging API to bridge them.

### The Three Contexts

```
┌─────────────────────────────────────────────────────────────┐
│  WEB PAGE CONTEXT                                           │
│  content.js runs here                                       │
│  • Can read/modify the DOM                                  │
│  • Cannot call Chrome APIs directly (except messaging)      │
│  • Cannot make cross-origin fetch requests                  │
└────────────────────────┬────────────────────────────────────┘
                         │ chrome.runtime.sendMessage()
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVICE WORKER CONTEXT                                     │
│  background.js runs here                                    │
│  • Full Chrome API access                                   │
│  • Can make fetch() to any allowed origin                   │
│  • Manages chrome.storage                                   │
│  • Routes messages between content script and API           │
└────────────────────────┬────────────────────────────────────┘
                         │ chrome.runtime.sendMessage()
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  EXTENSION PAGE CONTEXT                                     │
│  Angular SPA (popup) runs here                              │
│  • Full Chrome API access                                   │
│  • Renders the popup UI                                     │
│  • Reads from chrome.storage for stats and detections       │
└─────────────────────────────────────────────────────────────┘
```

### Message Types

All communication between contexts uses typed messages:

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `get-settings` | Popup → Background | Load enabled state, stats, detections |
| `set-enabled` | Popup → Background | Toggle scanner on/off |
| `score-text` | Content → Background | Send text for AI scoring |
| `get-metrics` | Popup → Background | Fetch model performance data |
| `get-analytics` | Popup → Background | Fetch community analytics |
| `submit-report` | Popup → Background | Submit a scam report |
| `get-report-status` | Popup → Background | Look up a report by ID |
| `TOGGLE` | Background → Content | Notify content script of enable/disable |

---

## 5. Real-Time Scanner — Deep Dive

This is the core feature. Here is exactly what happens from the moment a user loads a Facebook page.

### Step 1 — Injection

When the browser navigates to any URL, Chrome injects `content.js` at `document_idle` (after the DOM is ready). The script immediately:
- Detects the platform (`facebook.com` → `'fb'`, `mail.google.com` → `'gmail'`, etc.)
- Injects CSS styles for the risk badges
- Calls `boot()` to check if scanning is enabled

### Step 2 — Platform-Specific Element Selection

`getPostCandidates()` uses different CSS selectors per platform to find the right elements:

```
Facebook/Instagram → div[dir="auto"]  (post text containers)
Twitter/X          → [data-testid="tweet"]
Gmail              → .adn.ads, .ii.gt  (email body)
Telegram           → article elements
Generic sites      → article, [role="article"]
```

This avoids scanning UI chrome (buttons, headers, timestamps) and focuses only on user-generated content.

### Step 3 — Visibility Filtering

Before scoring any element, `isElementVisible()` checks if it is currently in the viewport:

```javascript
function isElementVisible(el) {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}
```

This prevents wasting API calls on off-screen content. A `scroll` event listener re-triggers scanning as the user scrolls down.

### Step 4 — Deduplication

Each scanned element gets a `data-scamstop-scanned="1"` attribute. A `pendingElements` Set tracks elements currently being scored. Both checks prevent the same element from being scored multiple times.

### Step 5 — Text and Link Extraction

`extractText()` clones the DOM element and strips noise before extracting text:

```
Removed: script, style, button, svg, img, video,
         .scamstop-marker, time, h4, [role="link"],
         .x1i10hfl, .x1rg5omt  (Facebook internal classes)
```

`extractLinks()` runs **before** the clone strips anchor tags. It:
1. Collects all `<a href>` values
2. Resolves relative URLs to absolute
3. Unwraps Facebook redirect URLs (`l.facebook.com/l.php?u=`) to reveal the real destination
4. Strips tracking parameters (`fbclid`, `gclid`, UTM params, etc.)
5. Deduplicates

The final text sent for scoring is: `[message body] [link1] [link2] ...`

This is important — scam links are a strong signal and the model sees them as part of the text.

### Step 6 — Scoring via Background

`content.js` cannot make direct HTTP requests to external servers. It sends a message to `background.js`:

```javascript
chrome.runtime.sendMessage({
  type: 'score-text',
  payload: { text, url: location.hostname, links }
})
```

`background.js` receives this, calls `POST /api/detect` on the Flask server, and returns the result.

### Step 7 — Badge Rendering

If the API returns a scam probability, `upsertBadge()` creates a DOM element and appends it to the scanned element:

```
RISK: 92% · NLP     ← red badge, NLP detection
RISK: 99% · LSH     ← red badge, LSH near-duplicate
RISK: 99% · Keyword ← red badge, keyword match
RISK: 23% · NLP     ← green badge, low risk
```

Clicking the badge opens a modal showing the full message text, risk score, detection method, and any extracted links.

### Step 8 — MutationObserver

A `MutationObserver` watches `document.body` for DOM changes. When new content loads (infinite scroll, dynamic feeds), `scanVisibleCandidates()` is called again automatically.

---

## 6. The AI Detection Engine

The `ScamStopEngine` class in `server.py` implements a **three-tier hybrid detection pipeline**. Each tier is faster and cheaper than the next, so most messages are resolved early.

### Architecture

```
Input message
      │
      ▼
┌─────────────────────────────────────────┐
│  TIER 0: Keyword Cache                  │
│  In-memory set of known scam keywords   │
│  Refreshed from Firestore every 30 min  │
│                                         │
│  if keyword in message.lower():         │
│      return SCAM (99%, "Keyword")       │
└──────────────────┬──────────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐
│  TIER 1: LSH Near-Duplicate             │
│  MinHash with 128 permutations          │
│  20 bands × 4 rows per band             │
│  Similarity threshold: 0.5              │
│                                         │
│  Computes band hashes, checks against   │
│  in-memory lsh_cache set                │
│  (refreshed from Firestore every 30min) │
│                                         │
│  if any band_hash in lsh_cache:         │
│      return SCAM (99%, "LSH")           │
└──────────────────┬──────────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────┐
│  TIER 2: NLP Classifier                 │
│  TF-IDF vectorizer (1-2 ngrams,         │
│  max 50,000 features)                   │
│  Multinomial Naive Bayes classifier     │
│                                         │
│  prob = classifier.predict_proba()[1]   │
│                                         │
│  if prob > 0.70:                        │
│      return SCAM (prob%, "NLP")         │
│  else:                                  │
│      return SAFE                        │
└─────────────────────────────────────────┘
```

### Why This Three-Tier Design?

- **Tier 0 (Keyword)** catches obvious, known scam phrases instantly with zero ML overhead.
- **Tier 1 (LSH)** catches paraphrased or slightly modified versions of previously reported scams. A scammer who changes a few words still gets caught because the MinHash similarity is above the 0.5 threshold.
- **Tier 2 (NLP)** catches novel scams that have never been seen before, using statistical patterns learned from thousands of training examples.

### MinHash LSH — How It Works

MinHash converts a text document into a fixed-size signature (128 hash values). The signature is split into 20 bands of 4 rows each. Two documents are considered similar if **at least one band** produces the same hash — this is the "candidate pair" mechanism of LSH.

The band hashes are stored in Firestore (`lsh_index/band_N/hashes`) and loaded into an in-memory Python `set` every 30 minutes. Lookups are O(1).

When a new NLP-detected scam is found, its band hashes are added to the in-memory cache immediately (without a Firestore write) so future similar messages are caught by LSH instead of NLP.

### Safe Sample Feedback Loop

When a message is classified as **SAFE**, it is appended to `safe_samples.jsonl` on the server. These samples are used as negative training examples in the next retraining cycle, preventing the model from drifting toward over-flagging.

---

## 7. Report Submission Flow

When a user submits a scam report, the flow bypasses the Flask API entirely and writes directly to Firestore from the browser.

```
User fills form
      │
      ▼
File attached?
  YES → Upload to Uploadcare → get CDN URL
  NO  → skip
      │
      ▼
FirestoreService.submitReport()
      │
      ▼
addDoc(collection(db, 'reports'), {
  message, victim_name, scam_type,
  url, evidence_url, city,
  latitude, longitude,
  suspect_name, suspect_contact,
  amount_lost,
  reported_at: serverTimestamp(),
  status: 'pending'
})
      │
      ▼
Firestore returns document ID
      │
      ▼
Report ID shown to user
(e.g. "aB3xK9mNpQ2rT7uV")
```

**Why direct to Firestore?** The previous design routed through the Flask API, which added the cold-start latency of the Render server (up to 30 seconds). Direct Firestore writes are typically 100–300ms.

The Flask API still handles LSH band indexing for reports — this happens in a **background thread** after the Firestore write, so the user gets an instant response.

---

## 8. Data Storage Architecture

### Firestore Collections

| Collection | Documents | Purpose |
|-----------|-----------|---------|
| `reports` | One per submitted report | Stores all report data, status, admin replies |
| `lsh_index/band_N/hashes` | One per band hash | LSH near-duplicate index (20 sub-collections) |
| `keywords` | One per keyword | Known scam keywords for Tier 0 detection |
| `stats/global` | Single document | Global flagged count counter |
| `retrain_log` | One per retrain run | Audit trail of model retraining history |

### Chrome Local Storage

The background script uses `chrome.storage.local` for:

| Key | Type | Content |
|-----|------|---------|
| `stats` | Object | `{ scanned, flagged, safe }` — user's personal scan counts |
| `recentDetections` | Array (max 30) | Last 30 flagged items with text, risk, URL, timestamp |

### Chrome Sync Storage

| Key | Type | Content |
|-----|------|---------|
| `enabled` | Boolean | Whether real-time scanning is on |
| `apiBase` | String | API server URL (configurable) |

### Server-Side Files

| File | Purpose |
|------|---------|
| `safe_samples.jsonl` | Accumulates safe messages between retraining cycles |
| `csv_scam_samples.jsonl` | Admin-uploaded scam CSV rows pending next retrain |
| `csv_safe_samples.jsonl` | Admin-uploaded safe CSV rows pending next retrain |
| `src/AI-model/scam_stop_engine.joblib` | Serialized trained model |

---

## 9. Model Retraining Pipeline

The model retrains automatically every **7 days** using a background thread scheduler. It can also be triggered manually from the admin panel.

### Training Data Sources

```
SCAM samples (label = 1):
  ├── keywords collection (Firestore)
  └── csv_scam_samples.jsonl (admin CSV uploads)

SAFE samples (label = 0):
  ├── safe_samples.jsonl (auto-collected from SAFE detections)
  └── csv_safe_samples.jsonl (admin CSV uploads)
```

### Retraining Steps

```
1. Load all scam and safe texts from sources above
2. Deduplicate both sets (prevents accuracy inflation)
3. Pad safe set with neutral fillers if < 10 samples
4. Train/test split: 80% train, 20% test (stratified)
5. Fit TF-IDF vectorizer on training set only
6. Train Multinomial Naive Bayes on training set
7. Build temporary LSH index from training scam texts
8. Evaluate on test set using full hybrid pipeline:
   - For each test message: try LSH first, then NLP
9. Compute: Accuracy, Precision, Recall, F1, AUC-ROC
10. Patch live model in memory (zero downtime)
11. Save updated model to scam_stop_engine.joblib
12. Log results to retrain_log collection in Firestore
13. Purge consumed training data files
```

### Why Evaluate with the Full Hybrid Pipeline?

Evaluating only the NLP classifier would give inflated metrics because LSH catches many test samples before NLP even runs. The evaluation mirrors real-world usage: LSH is tried first, NLP second. This gives honest, realistic performance numbers.

### Metrics Reported

| Metric | What it measures |
|--------|----------------|
| **Accuracy** | Overall correct predictions / total predictions |
| **Precision** | True positives / (true positives + false positives) — "of what we flagged, how much was actually scam?" |
| **Recall** | True positives / (true positives + false negatives) — "of all actual scams, how many did we catch?" |
| **F1-Score** | Harmonic mean of Precision and Recall |
| **AUC-ROC** | Area under the ROC curve — model's discrimination ability across all thresholds |

---

## 10. Analytics Pipeline

The Analytics screen reads directly from Firestore — no API call needed.

```
FirestoreService.getAnalytics()
      │
      ▼
getDocs(query(collection(db, 'reports'),
        orderBy('reported_at', 'desc')))
      │
      ▼
For each document:
  - Increment totals (total, pending, verified, rejected)
  - If reported_at within last 7 days → increment day bucket
  - If city present → increment city bucket
  - If scam_type present → increment type bucket
      │
      ▼
Return aggregated BarDatum arrays:
  reports_by_day  (last 7 days, ordered Mon→Sun)
  reports_by_city (top 10 by count)
  reports_by_type (all types, sorted by count)
  totals
```

Model performance metrics come from a separate call to `GET /api/metrics` on the Flask server, which returns the `performance_data` stored on the live model object.

---

## 11. Privacy and Compliance

ScamStop is designed in compliance with **Republic Act No. 10173 — Data Privacy Act of 2012**.

### Key Compliance Measures Implemented

| Requirement | Implementation |
|-------------|---------------|
| Informed consent | Privacy Notice modal with explicit consent checkbox before report submission |
| Purpose limitation | Scanned text is not stored unless user submits a report |
| Data minimization | Only city-level location collected (not precise GPS coordinates in extension context) |
| Third-party disclosure | Privacy Notice lists Firebase, Uploadcare, and PNP-ACG as data recipients |
| Data subject rights | Report ID system allows users to identify and request deletion of their data |
| Retention policy | 3-year maximum retention stated in Privacy Notice |
| Security | HTTPS for all connections, Firestore security rules, no secret keys in client code |

### What the Extension Reads vs. What It Stores

| Data | Read? | Stored? | Where |
|------|-------|---------|-------|
| Page text content | Yes | No (unless report submitted) | Sent to API, discarded after scoring |
| Links in messages | Yes | No | Sent to API, discarded after scoring |
| Victim name | Yes (form input) | Yes | Firestore `reports` |
| Scam message | Yes (form input) | Yes | Firestore `reports` |
| City/location | Yes (auto-detected) | Yes (if report submitted) | Firestore `reports` |
| Evidence files | Yes (user upload) | Yes | Uploadcare CDN |

---

## 12. End-to-End Request Flow Diagrams

### Real-Time Detection Flow

```
Browser loads facebook.com
        │
        ▼
Chrome injects content.js
        │
        ▼
content.js: getPostCandidates()
  → finds div[dir="auto"] elements
        │
        ▼
For each visible, unscanned element:
  extractLinks() → unwrap FB redirects → strip tracking params
  extractText()  → clone DOM, strip noise, append links
        │
        ▼
chrome.runtime.sendMessage({ type: 'score-text', payload: { text, url } })
        │
        ▼
background.js receives message
  → fetch('https://scamstop-api.onrender.com/api/detect', { message: text })
        │
        ▼
Flask /api/detect:
  model.predict(message)
    → Tier 0: keyword check (in-memory set)
    → Tier 1: LSH band hash check (in-memory set)
    → Tier 2: TF-IDF + Naive Bayes
  parse_predict_result() → { is_scam, prob, method }
  if NLP scam → add band hashes to lsh_cache (memory only)
  if SAFE     → append to safe_samples.jsonl
  return { is_scam, scam_probability, detection_method }
        │
        ▼
background.js:
  recordDetection() → update chrome.storage.local stats + recentDetections
  sendResponse({ ok: true, result: { scamProbability, isScam, detectionMethod } })
        │
        ▼
content.js:
  upsertBadge(element, probability, links, detectionMethod)
  → appends "RISK: 92% · NLP" badge to DOM element
```

### Report Submission Flow

```
User fills report form + checks Privacy Notice consent
        │
        ▼
File attached? → uploadFile() → Uploadcare API → CDN URL
        │
        ▼
FirestoreService.submitReport(payload)
  → addDoc(collection(db, 'reports'), { ...fields, status: 'pending' })
        │
        ▼
Firestore returns document reference ID
        │
        ▼
Background thread: _write_bands()
  → model._get_minhash(message)
  → model._get_bands(minhash)
  → 20 parallel Firestore writes to lsh_index/band_N/hashes
  → lsh_cache.add(band_hash) for each band
        │
        ▼
User sees: "Report submitted. ID: aB3xK9mNpQ2rT7uV"
```

---

## 13. Presenting Each Feature

### Opening — The Problem Statement

> "Every day, Filipinos lose money to scams on Facebook, Instagram, and SMS. The problem is not that people are careless — it is that scam messages are designed to look legitimate. ScamStop solves this by putting an AI detector directly inside the browser, so users get a warning before they engage."

### Demonstrating the Real-Time Scanner

1. Open Chrome with ScamStop installed and the scanner **ON**.
2. Navigate to Facebook.
3. Scroll through the feed — point out the risk badges appearing on posts.
4. Click a high-risk badge to show the Analysis Modal.
5. Highlight the detection method label (`· NLP`, `· LSH`, `· Keyword`).
6. Show a post with a link — point out the extracted link in the modal.
7. Toggle the scanner **OFF** from the popup — show badges disappearing.
8. Toggle back **ON** — show badges reappearing.

**Key talking point:** "The scanner runs entirely in the background. The user does not have to do anything — it just works."

### Demonstrating the Three Detection Tiers

> "The engine has three layers. The first checks for known scam keywords — instant. The second uses a technique called Locality-Sensitive Hashing to catch messages that are similar to previously reported scams, even if the wording is slightly different. The third uses a Naive Bayes NLP classifier trained on thousands of scam examples to catch brand-new scams it has never seen before."

Show the badge label changing between `· Keyword`, `· LSH`, and `· NLP` for different types of content.

### Demonstrating Report Submission

1. Click a high-risk badge → click **Report** in the modal.
2. Show the form pre-filled with the scam message.
3. Fill in victim name, select scam type, show auto-detected city.
4. Click the **Privacy Notice** link — walk through the RA 10173 compliance content.
5. Check consent, submit.
6. Show the Report ID.

**Key talking point:** "Reports go directly to our secure Firestore database. There is no server in the middle — this is why submission is instant."

### Demonstrating Report Status

1. Enter the Report ID from the previous demo.
2. Show the status card with the current status.
3. If an admin reply exists, show the reply section.

### Demonstrating Analytics

1. Navigate to the Analytics tab.
2. Walk through each chart: reports per day, by city, by scam type.
3. Show the Model Performance chart — explain each metric briefly.

**Key talking point:** "Every report submitted by a user becomes training data for the next model update. The system gets smarter as the community uses it."

### Demonstrating the Retraining Pipeline

> "Every week, the server automatically retrains the AI model using all the new reports and safe messages collected since the last cycle. It uses an 80/20 train-test split and evaluates the full hybrid pipeline — not just the NLP classifier — so the metrics you see here reflect real-world performance."

---

## 14. Anticipated Questions and Answers

**Q: Does ScamStop send my private messages to a server?**

A: The content of posts and messages visible on your screen is sent to the ScamStop AI server for analysis. This is necessary for the detection to work. The text is analyzed and discarded — it is not stored unless you explicitly submit a formal report. This is disclosed in the Privacy Notice, which users must consent to before submitting reports.

**Q: What happens if the AI is wrong and flags a legitimate message?**

A: The model has a 70% confidence threshold before flagging anything. False positives do happen — no AI is perfect. The badge is advisory, not blocking. The user always makes the final decision. Safe messages that pass through the scanner are also collected as negative training examples, which helps reduce false positives over time.

**Q: Why does the extension need access to all URLs (`<all_urls>`)?**

A: Scams appear on any website — not just Facebook or Gmail. A scammer can send a link to any domain. The extension needs broad host permissions to scan content wherever the user encounters it. The permission is used only to inject the content script and scan visible text — not to read passwords, form data, or any other sensitive browser data.

**Q: How is this different from Google's Safe Browsing?**

A: Google Safe Browsing checks URLs against a blocklist of known malicious sites. ScamStop analyzes the **text content** of messages — the actual words used in a scam pitch. A scammer can use a brand-new domain that is not on any blocklist, but their message will still contain the same persuasion patterns that ScamStop's NLP model has learned to recognize.

**Q: What happens to reports after submission?**

A: Reports are stored in Firestore with a `pending` status. The review team (in coordination with PNP-ACG) reviews them and updates the status. Verified reports contribute to the LSH index so similar messages are caught faster in the future. Users can track their report status using the Report ID.

**Q: How does the LSH similarity detection work in simple terms?**

A: Imagine you have a scam message that says "Send money to claim your prize." A scammer slightly modifies it to "Transfer funds to receive your reward." The words are different but the meaning and structure are similar. MinHash converts both messages into a compact fingerprint. If the fingerprints are similar enough (above 50% similarity), the second message is flagged as a near-duplicate of the first — even though no exact words match.

**Q: Is this compliant with RA 10173?**

A: Yes. The app implements explicit informed consent before collecting personal data, discloses all data recipients (Firebase, Uploadcare, PNP-ACG), states a 3-year retention policy, and provides data subject rights through the Report ID system. The Privacy Notice is accessible from the report form and the About screen.

---

*ScamStop Technical Presentation Guide — © 2026 Team Ambergris*  
*In partnership with the Philippine National Police*
