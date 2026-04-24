const DEFAULT_SETTINGS = {
  enabled: true,
  apiBase: 'http://127.0.0.1:3000'
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(['enabled', 'apiBase', 'stats', 'detections']);

  const nextSettings = {
    enabled: typeof current.enabled === 'boolean' ? current.enabled : DEFAULT_SETTINGS.enabled,
    apiBase: typeof current.apiBase === 'string' && current.apiBase.trim() ? current.apiBase.trim() : DEFAULT_SETTINGS.apiBase,
    stats: current.stats || { scanned: 0, flagged: 0, safe: 0 },
    detections: current.detections || []
  };

  await chrome.storage.sync.set(nextSettings);
  console.log('ScamStop extension installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'Invalid message' });
    return false;
  }

  if (message.type === 'get-settings') {
    chrome.storage.sync.get(['enabled', 'apiBase', 'stats', 'detections'], (data) => {
      sendResponse({
        ok: true,
        settings: {
          enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_SETTINGS.enabled,
          apiBase: data.apiBase || DEFAULT_SETTINGS.apiBase
        },
        stats: data.stats || { scanned: 0, flagged: 0, safe: 0 },
        detections: data.detections || []
      });
    });
    return true;
  }

  if (message.type === 'set-enabled') {
    chrome.storage.sync.set({ enabled: !!message.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'set-api-base') {
    const apiBase = String(message.apiBase || '').trim();
    if (!apiBase) {
      sendResponse({ ok: false, error: 'API URL is required.' });
      return false;
    }

    chrome.storage.sync.set({ apiBase }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'score-text' || message.type === 'SCAN_NOW') {
    const text = message.payload?.text || message.text;
    if (!text || typeof text !== 'string' || !text.trim()) {
      sendResponse({ ok: false, error: 'No text to score.' });
      return false;
    }

    chrome.storage.sync.get(['apiBase'], async (data) => {
      const apiBase = (data.apiBase && String(data.apiBase).trim()) || DEFAULT_SETTINGS.apiBase;
      console.log('ScamStop background: sending text to API', apiBase, text.slice(0, 120));
      try {
        const response = await fetch(`${apiBase}/api/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });

        if (!response.ok) {
          sendResponse({ ok: false, error: `Model API returned ${response.status}` });
          return;
        }

        const body = await response.json();
        sendResponse({
          ok: true,
          result: {
            scamProbability: Number(body?.scam_probability || 0),
            isScam: !!body?.is_scam
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    });

    return true;
  }

  sendResponse({ ok: false, error: 'Unsupported message type' });
  return false;
});
