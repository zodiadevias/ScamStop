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
  const links = extractLinks(element);
  const text  = extractText(element);   // already includes [links: ...] suffix
  if (!text || text.length < 10) return;

  // Pass the current page URL so the background can record it
  const response = await sendMessage({
    type: 'score-text',
    payload: { text, url: location.hostname, links }
  });

  if (response?.ok && response.result) {
    upsertBadge(element, response.result.scamProbability, links, response.result.detectionMethod);
  }
}

function upsertBadge(element, probability, links = [], detectionMethod = null) {
  if (element.querySelector('.scamstop-marker')) return;
  element.classList.add('scamstop-anchor');
  const badge = document.createElement('div');
  badge.className = 'scamstop-marker';
  const rounded = Math.round(probability);

  // Label: "RISK: 92% · NLP" or "RISK: 99% · LSH" or "RISK: 99% · Keyword"
  const methodLabel = detectionMethod ? ` · ${detectionMethod}` : '';
  badge.textContent = `RISK: ${rounded}%${methodLabel}`;
  badge.setAttribute('data-risk', getRiskLevel(rounded));
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    showFullContentModal(extractText(element), rounded, links, detectionMethod);
  });
  element.appendChild(badge);
}

function extractText(element) {
  // ── 1. Harvest all links before cloning strips them ──────────────────────
  const links = extractLinks(element);

  const clone = element.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return '';

  clone.querySelectorAll(
    'script, style, button, svg, img, video, .scamstop-marker, time, h4, [role="link"], .x1i10hfl, .x1rg5omt'
  ).forEach(n => n.remove());

  const bodyText = (clone.innerText || clone.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

  // ── 2. Append extracted links so the model sees them ─────────────────────
  const linkSuffix = links.length > 0 ? ' ' + links.join(' ') : '';

  const final = (bodyText + linkSuffix).trim();

  return final.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Collect unique, non-trivial hrefs from all anchor tags inside an element.
 * Filters out javascript:, mailto:, tel:, and same-origin fragment-only links.
 * Unwraps known tracker/redirect URLs (Facebook, Google, etc.) to their real destination.
 */
function extractLinks(element) {
  const seen = new Set();
  const results = [];

  element.querySelectorAll('a[href]').forEach(anchor => {
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel):/i.test(raw)) return;

    let href = raw;

    // Resolve relative URLs to absolute
    try {
      href = new URL(raw, location.href).href;
    } catch (_) {
      // keep raw if URL parsing fails
    }

    // Unwrap redirect/tracker wrappers to get the real destination URL
    href = unwrapRedirect(href);

    // Strip tracking params from the final URL (covers direct links with fbclid etc.)
    try {
      const u = new URL(href);
      href = stripTrackingParams(u);
    } catch (_) {}

    // Skip same-page fragment-only links after resolution
    try {
      const u = new URL(href);
      if (u.origin === location.origin && !u.pathname.replace('/', '') && !u.search) return;
    } catch (_) {}

    if (!seen.has(href)) {
      seen.add(href);
      results.push(href);
    }
  });

  return results;
}

/**
 * Unwrap common redirect/tracker URLs to expose the real destination.
 *
 * Handles:
 *  - Facebook:  l.facebook.com/l.php?u=<encoded>
 *  - Google:    google.com/url?q=<encoded>  |  google.com/url?url=<encoded>
 *  - YouTube:   youtube.com/redirect?q=<encoded>
 *  - Instagram: l.instagram.com/?u=<encoded>
 *  - Twitter/X: t.co/<short>  (can't resolve without a fetch — kept as-is)
 *  - Generic:   any URL whose path is /l.php, /redirect, /out, /go, /link
 *               and has a param named u, url, q, or dest
 */
function unwrapRedirect(href) {
  let url;
  try { url = new URL(href); } catch (_) { return href; }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  // ── Facebook ──────────────────────────────────────────────────────────────
  if ((host === 'l.facebook.com' || host === 'lm.facebook.com') && path === '/l.php') {
    return decodeParam(url, 'u') || href;
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (host === 'l.instagram.com') {
    return decodeParam(url, 'u') || href;
  }

  // ── Google ────────────────────────────────────────────────────────────────
  if (host === 'www.google.com' && path === '/url') {
    return decodeParam(url, 'q') || decodeParam(url, 'url') || href;
  }

  // ── YouTube redirect ──────────────────────────────────────────────────────
  if ((host === 'www.youtube.com' || host === 'youtube.com') && path === '/redirect') {
    return decodeParam(url, 'q') || href;
  }

  // ── Generic redirect patterns ─────────────────────────────────────────────
  const redirectPaths = ['/l.php', '/redirect', '/out', '/go', '/link', '/r'];
  if (redirectPaths.some(p => path === p || path.startsWith(p + '/'))) {
    return decodeParam(url, 'u') || decodeParam(url, 'url') ||
           decodeParam(url, 'q') || decodeParam(url, 'dest') || href;
  }

  return href;
}

/** Safely decode a URL search parameter; returns null if missing or invalid. */
function decodeParam(url, param) {
  const val = url.searchParams.get(param);
  if (!val) return null;
  try {
    // Some trackers double-encode; decode once and validate it's a URL
    const decoded = decodeURIComponent(val);
    const parsed = new URL(decoded); // throws if not a valid URL
    return stripTrackingParams(parsed);
  } catch (_) {
    return null;
  }
}

/**
 * Remove well-known tracking/analytics query parameters from a URL,
 * leaving only the meaningful destination.
 *
 * Covers: Facebook (fbclid), Google (gclid, gclsrc), UTM params,
 * Microsoft (msclkid), Twitter (twclid), and others.
 */
const TRACKING_PARAMS = new Set([
  'fbclid', 'igshid',                          // Facebook / Instagram
  'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid', // Google Ads
  'utm_source', 'utm_medium', 'utm_campaign',  // UTM
  'utm_term', 'utm_content', 'utm_id',
  'msclkid',                                   // Microsoft Ads
  'twclid',                                    // Twitter
  'mc_eid', 'mc_cid',                          // Mailchimp
  '_hsenc', '_hsmi', 'hsCtaTracking',          // HubSpot
  'ref', 'referrer',                           // generic referrer params
]);

function stripTrackingParams(url) {
  TRACKING_PARAMS.forEach(p => url.searchParams.delete(p));
  // Return clean href; remove trailing '?' if no params remain
  return url.href.replace(/\?$/, '');
}

function injectStyles(pKey) {
  const style = document.createElement('style');
  style.id = 'scamstop-styles';
  let css = `
    .scamstop-marker {
      position: relative; z-index: 9999 !important; padding: 2px 6px; border-radius: 4px;
      width: max-content; min-width: 60px; text-align: center;
      height: 15px;
      font-family: sans-serif; font-size: 10px; font-weight: bold; color: black !important;
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
      border: 1px solid #444; font-family: sans-serif; color: white;
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

function showFullContentModal(text, risk, links = [], detectionMethod = null) {
  const root = document.createElement('div');
  root.className = 'scamstop-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'scamstop-modal';

  const title = document.createElement('h3');
  title.textContent = 'ScamStop Analysis';

  const riskPara = document.createElement('p');
  const riskLabel = document.createElement('strong');
  riskLabel.textContent = 'Risk Score: ';
  riskPara.appendChild(riskLabel);
  riskPara.appendChild(document.createTextNode(`${risk}%`));

  // ── Detection method badge ────────────────────────────────────────────────
  if (detectionMethod) {
    const methodColors = { NLP: '#818cf8', LSH: '#fb923c', Keyword: '#f87171' };
    const color = methodColors[detectionMethod] || '#9ca3af';
    const methodBadge = document.createElement('p');
    methodBadge.style.cssText = `margin:4px 0 8px;font-size:12px;`;
    const methodSpan = document.createElement('span');
    methodSpan.style.cssText = `background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:bold;`;
    methodSpan.textContent = `Detected via ${detectionMethod}`;
    methodBadge.appendChild(methodSpan);
    modal.appendChild(title);
    modal.appendChild(riskPara);
    modal.appendChild(methodBadge);
  } else {
    modal.appendChild(title);
    modal.appendChild(riskPara);
  }

  const textBox = document.createElement('div');
  textBox.style.cssText = 'background:#222;padding:10px;border-radius:5px;margin:10px 0;font-size:13px;color:#ccc;word-break:break-word;';
  textBox.textContent = text; // textContent — never innerHTML, prevents XSS

  modal.appendChild(textBox);

  // ── Links section ─────────────────────────────────────────────────────────
  if (links.length > 0) {
    const linksLabel = document.createElement('p');
    linksLabel.style.cssText = 'margin:8px 0 4px;font-size:12px;color:#aaa;';
    const linksStrong = document.createElement('strong');
    linksStrong.textContent = `Links found (${links.length}):`;
    linksLabel.appendChild(linksStrong);
    modal.appendChild(linksLabel);

    const linksList = document.createElement('div');
    linksList.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:5px;padding:8px;max-height:100px;overflow-y:auto;';

    links.forEach(href => {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:11px;color:#60a5fa;word-break:break-all;margin-bottom:3px;';
      row.textContent = href; // textContent — XSS safe
      linksList.appendChild(row);
    });

    modal.appendChild(linksList);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'width:100%;padding:10px;cursor:pointer;margin-top:10px;';
  closeBtn.addEventListener('click', () => root.remove());

  modal.appendChild(closeBtn);
  root.appendChild(modal);

  // Close on backdrop click
  root.addEventListener('click', (e) => {
    if (e.target === root) root.remove();
  });

  document.body.appendChild(root);
}

function getRiskLevel(p) { return p >= 70 ? 'high' : (p >= 40 ? 'medium' : 'low'); }
function isElementVisible(el) { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }
function sendMessage(msg) { return new Promise(res => chrome.runtime.sendMessage(msg, r => res(r))); }
