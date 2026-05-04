const DEFAULT_SETTINGS = {
  enabled: true,
  // TODO: Replace with your Render URL before publishing
  apiBase: 'https://scamstop-api.onrender.com'
};

// ---------------------------------------------------------------------------
// Install — force-reset apiBase to Render URL on every install/update
// so stale localhost values from previous installs are cleared.
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    apiBase: DEFAULT_SETTINGS.apiBase,
  });

  const current = await chrome.storage.sync.get(['enabled']);
  if (typeof current.enabled !== 'boolean') {
    await chrome.storage.sync.set({ enabled: DEFAULT_SETTINGS.enabled });
  }

  // Seed stats + detections in local storage (larger quota, no sync needed)
  const local = await chrome.storage.local.get(['stats', 'recentDetections']);
  if (!local.stats) {
    await chrome.storage.local.set({ stats: { scanned: 0, flagged: 0, safe: 0 } });
  }
  if (!local.recentDetections) {
    await chrome.storage.local.set({ recentDetections: [] });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getApiBase() {
  const data = await chrome.storage.sync.get(['apiBase']);
  return (data.apiBase && String(data.apiBase).trim()) || DEFAULT_SETTINGS.apiBase;
}

async function recordDetection(text, url, scamProbability, isScam) {
  const local = await chrome.storage.local.get(['stats', 'recentDetections']);

  const stats = local.stats || { scanned: 0, flagged: 0, safe: 0 };
  stats.scanned++;
  if (isScam) stats.flagged++; else stats.safe++;

  const entry = {
    text: String(text).slice(0, 500),
    risk: Number(scamProbability),
    url: String(url || 'Unknown'),
    ts: Date.now().toString(),
  };

  const detections = [entry, ...(local.recentDetections || [])].slice(0, 30);

  await chrome.storage.local.set({ stats, recentDetections: detections });

  // Sync flagged count to Firestore (fire-and-forget)
  if (isScam) {
    getApiBase().then(apiBase => {
      fetch(`${apiBase}/api/stats/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: String(text).slice(0, 500),
          url: String(url || 'Unknown'),
          risk: Number(scamProbability),
        }),
      }).catch(() => {}); // silent — don't block detection flow
    });
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'Invalid message' });
    return false;
  }

  // ── Get settings + detections (used by popup home page) ──────────────────
  if (message.type === 'get-settings') {
    (async () => {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get(['enabled', 'apiBase']),
        chrome.storage.local.get(['stats', 'recentDetections']),
      ]);
      sendResponse({
        ok: true,
        settings: {
          enabled: typeof sync.enabled === 'boolean' ? sync.enabled : DEFAULT_SETTINGS.enabled,
          apiBase: sync.apiBase || DEFAULT_SETTINGS.apiBase,
        },
        stats: local.stats || { scanned: 0, flagged: 0, safe: 0 },
        detections: local.recentDetections || [],
      });
    })();
    return true;
  }

  // ── Toggle enabled ────────────────────────────────────────────────────────
  if (message.type === 'set-enabled') {
    chrome.storage.sync.set({ enabled: !!message.enabled }, () => sendResponse({ ok: true }));
    return true;
  }

  // ── Set API base ──────────────────────────────────────────────────────────
  if (message.type === 'set-api-base') {
    const apiBase = String(message.apiBase || '').trim();
    if (!apiBase) { sendResponse({ ok: false, error: 'API URL is required.' }); return false; }
    chrome.storage.sync.set({ apiBase }, () => sendResponse({ ok: true }));
    return true;
  }

  // ── Score text (called by content script) ─────────────────────────────────
  if (message.type === 'score-text' || message.type === 'SCAN_NOW') {
    const text = message.payload?.text || message.text;
    const url  = message.payload?.url  || message.url || 'Unknown';

    if (!text || typeof text !== 'string' || !text.trim()) {
      sendResponse({ ok: false, error: 'No text to score.' });
      return false;
    }

    (async () => {
      const apiBase = await getApiBase();
      try {
        const response = await fetch(`${apiBase}/api/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });

        if (!response.ok) {
          sendResponse({ ok: false, error: `API returned ${response.status}` });
          return;
        }

        const body = await response.json();
        const scamProbability = Number(body?.scam_probability || 0);
        const isScam = !!body?.is_scam;
        const detectionMethod = body?.detection_method || null;

        // Always record — popup reads from local storage
        await recordDetection(text, url, scamProbability, isScam);

        sendResponse({ ok: true, result: { scamProbability, isScam, detectionMethod } });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // ── Metrics ───────────────────────────────────────────────────────────────
  if (message.type === 'get-metrics') {
    (async () => {
      const apiBase = await getApiBase();
      try {
        const response = await fetch(`${apiBase}/api/metrics`);
        if (!response.ok) { sendResponse({ ok: false, error: `API returned ${response.status}` }); return; }
        const data = await response.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  if (message.type === 'get-analytics') {
    (async () => {
      const apiBase = await getApiBase();
      try {
        const response = await fetch(`${apiBase}/api/analytics`);
        if (!response.ok) { sendResponse({ ok: false, error: `API returned ${response.status}` }); return; }
        const data = await response.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // ── Submit report ─────────────────────────────────────────────────────────
  if (message.type === 'submit-report') {
    const payload = message.payload || {};
    const {
      message: msg,
      victim_name,
      scam_type,
      url,
      evidence_url,
      city,
      latitude,
      longitude,
      suspect_name,
      suspect_contact,
      amount_lost,
    } = payload;

    if (!msg) { sendResponse({ ok: false, error: 'No message provided.' }); return false; }

    (async () => {
      const apiBase = await getApiBase();
      try {
        const response = await fetch(`${apiBase}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            victim_name,
            scam_type,
            url,
            evidence_url,
            city,
            latitude,
            longitude,
            suspect_name,
            suspect_contact,
            amount_lost,
          }),
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          sendResponse({ ok: false, error: `Server error ${response.status}: ${errText}` });
          return;
        }
        const data = await response.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // ── Report status lookup ──────────────────────────────────────────────────
  if (message.type === 'get-report-status') {
    const { reportId } = message;
    if (!reportId) { sendResponse({ ok: false, error: 'No report ID provided.' }); return false; }

    (async () => {
      const apiBase = await getApiBase();
      try {
        const response = await fetch(`${apiBase}/api/report/${reportId}`);
        if (response.status === 404) { sendResponse({ ok: false, status: 404, error: 'Report not found.' }); return; }
        if (!response.ok) { sendResponse({ ok: false, error: `API returned ${response.status}` }); return; }
        const data = await response.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: 'Unsupported message type' });
  return false;
});


