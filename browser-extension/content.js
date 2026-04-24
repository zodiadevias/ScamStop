const SCANNED_ATTR = 'data-scamstop-scanned';
const MAX_TEXT_LENGTH = 1500;
const pendingElements = new Set();
let observer;
let enabled = true;

const platform = getPlatformKey();
injectStyles(platform);
boot();

function getPlatformKey() {
  const host = location.hostname;
  if (host.includes('facebook.com')) return 'fb';
  if (host.includes('instagram.com')) return 'ig';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
  if (host.includes('mail.google.com')) return 'gmail';
  if (host.includes('web.telegram.org') || host.includes('t.me')) return 'tg';
  return 'generic';
}

async function boot() {
  const settings = await sendMessage({ type: 'get-settings' });
  enabled = settings?.settings?.enabled ?? true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enabled) {
      enabled = !!changes.enabled.newValue;
      if (enabled) {
        if (!observer) startMutationObserver();
        scanVisibleCandidates();
      } else {
        removeAllMarkers();
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE') {
      enabled = message.enabled;
      enabled ? scanVisibleCandidates() : removeAllMarkers();
      sendResponse({ ok: true });
    }
  });

  if (!enabled) {
    removeAllMarkers();
    return;
  }

  scanVisibleCandidates();
  startMutationObserver();
}

function startMutationObserver() {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (enabled) scanVisibleCandidates();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      scanVisibleCandidates();
    }
  });
}

function removeAllMarkers() {
  document.querySelectorAll('.scamstop-marker').forEach(el => el.remove());
  document.querySelectorAll(`[${SCANNED_ATTR}]`).forEach(el => {
    el.removeAttribute(SCANNED_ATTR);
    el.classList.remove('scamstop-anchor');
  });
}

function onScroll() {
  if (!enabled) return;
  window.requestAnimationFrame(scanVisibleCandidates);
}

function getPostCandidates() {
  switch (platform) {
    case 'fb':
    case 'ig': {
      const allDivs = Array.from(document.querySelectorAll('div[dir="auto"], div[style*="text-align"]'));
      return allDivs.filter(el => {
        const text = el.innerText.trim();
        const isRightLength = text.length > 5 && text.length < 2000;
        const isNotHeader = !el.closest('h1, h2, h3, h4, a[role="link"]');
        const isNotUI = !el.closest('button, time, [role="button"]');
        return isRightLength && isNotHeader && isNotUI;
      });
    }
    case 'x':
      return Array.from(document.querySelectorAll('[data-testid="tweet"]'));
    case 'gmail':
      return Array.from(document.querySelectorAll('.adn.ads, .ii.gt'));
    default:
      return Array.from(document.querySelectorAll('article, [role="article"]'));
  }
}

function scanVisibleCandidates() {
  const candidates = getPostCandidates();
  for (const el of candidates) {
    if (el.getAttribute(SCANNED_ATTR) === '1' || pendingElements.has(el)) continue;
    const hasCandidateParent = candidates.some(other => other !== el && other.contains(el));
    if (hasCandidateParent) continue;
    if (!isElementVisible(el)) continue;
    queueElementForScoring(el);
  }
}

function queueElementForScoring(element) {
  pendingElements.add(element);
  window.setTimeout(async () => {
    try {
      element.setAttribute(SCANNED_ATTR, '1');
      await scoreAndMark(element);
    } catch (e) {
      element.removeAttribute(SCANNED_ATTR);
    } finally {
      pendingElements.delete(element);
    }
  }, 150);
}

async function scoreAndMark(element) {
  const text = extractText(element);
  if (!text || text.length < 10) return;

  const response = await sendMessage({ type: 'score-text', payload: { text: text, url: window.location.hostname } });
  if (response?.ok && response.result) {
    const prob = response.result.scamProbability;
    upsertBadge(element, prob);
    saveToHistory({ text, risk: prob, platform, timestamp: new Date().toISOString() });
  }
}

function upsertBadge(element, probability) {
  if (element.querySelector('.scamstop-marker')) return;
  element.classList.add('scamstop-anchor');
  const badge = document.createElement('div');
  badge.className = 'scamstop-marker';
  const rounded = Math.round(probability);
  badge.textContent = `RISK: ${rounded}%`;
  badge.setAttribute('data-risk', getRiskLevel(rounded));
  badge.onclick = (e) => {
    e.stopPropagation();
    showFullContentModal(extractText(element), rounded);
  };
  element.appendChild(badge);
}

function extractText(element) {
  const clone = element.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return '';

  clone.querySelectorAll(
    'script, style, button, svg, img, video, .scamstop-marker, time, h4, [role="link"], .x1i10hfl, .x1rg5omt'
  ).forEach(n => n.remove());

  const final = (clone.innerText || clone.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('ScamStop captured content:', final);
  return final.slice(0, MAX_TEXT_LENGTH);
}

function injectStyles(pKey) {
  const style = document.createElement('style');
  style.id = 'scamstop-styles';
  let css = `
    .scamstop-marker {
      position: relative; z-index: 9999 !important; padding: 2px 6px; border-radius: 4px;
      width: max-content; min-width: 60px; text-align: center;
      height: 15px;
      font-family: sans-serif; font-size: 10px; font-weight: bold; color: white !important;
      cursor: pointer; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.5);
    }
    .scamstop-marker[data-risk="high"] { background: #ff3c5f !important; }
    .scamstop-marker[data-risk="medium"] { background: #ffb020 !important; }
    .scamstop-marker[data-risk="low"] { background: #00e5a0 !important; }
    .scamstop-modal-overlay {
      position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.85); z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    }
    .scamstop-modal {
      background: #1a1a1a; padding: 25px; border-radius: 12px; max-width: 450px; width: 90%; color: white;
      border: 1px solid #444; font-family: sans-serif;
    }
  `;

  if (pKey === 'gmail') {
    css += `.scamstop-marker{ position: absolute; top: 10px; right: 10px; }`;
  }

  css += `.scamstop-anchor { position: relative !important; }
          .scamstop-marker { top: 5px; right: 10px; }`;

  style.textContent = css;
  document.head.appendChild(style);
}

function showFullContentModal(text, risk) {
  const root = document.createElement('div');
  root.className = 'scamstop-modal-overlay';
  root.innerHTML = `
    <div class="scamstop-modal">
      <h3>ScamStop Analysis</h3>
      <p><strong>Risk Score:</strong> ${risk}%</p>
      <div style="background:#222; padding:10px; border-radius:5px; margin:10px 0; font-size:13px; color:#ccc;">${text}</div>
      <button id="ss-close" style="width:100%; padding:10px; cursor:pointer;">Close</button>
    </div>
  `;
  document.body.appendChild(root);
  document.getElementById('ss-close').onclick = () => root.remove();
}

function getRiskLevel(p) { return p >= 70 ? 'high' : (p >= 40 ? 'medium' : 'low'); }
function isElementVisible(el) { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }
function sendMessage(msg) { return new Promise(res => chrome.runtime.sendMessage(msg, r => res(r))); }
async function saveToHistory(item) {
  const data = await chrome.storage.local.get({ recentDetections: [] });
  const formattedItem = {
    text: item.text,
    risk: item.risk,
    url: item.platform === 'ig' ? 'instagram.com' : item.platform,
    ts: new Date().toISOString()
  };

  const updated = [formattedItem, ...data.recentDetections].slice(0, 20);
  await chrome.storage.local.set({ recentDetections: updated });
  console.log('ScamStop: Detection saved to storage', formattedItem);
}
