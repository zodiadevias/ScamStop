import { Injectable } from '@angular/core';

const SCANNED_ATTR = 'data-scamstop-scanned';
const MAX_TEXT_LENGTH = 1500;
const DEFAULT_SETTINGS = {
  enabled: true,
  apiBase: 'http://127.0.0.1:3000'
};

export interface DetectionEntry {
  risk: number;
  text: string;
  ts: string;
  url: string;
}

export interface ExtensionSettings {
  enabled: boolean;
  apiBase: string;
}

export interface ExtensionState {
  settings: ExtensionSettings;
  stats: { scanned: number; flagged: number; safe: number };
  detections: DetectionEntry[];
}

@Injectable({ providedIn: 'root' })
export class ContentScriptService {
  private enabled = true;
  private observer: MutationObserver | null = null;
  private pendingElements = new Set<HTMLElement>();
  private platform = 'generic';

  private get chrome(): any {
    return typeof window !== 'undefined' ? (window as any).chrome : undefined;
  }

  isExtensionContext(): boolean {
    return !!this.chrome && !!this.chrome.runtime;
  }

  async initContentScript(): Promise<void> {
    if (!this.isExtensionContext() || typeof document === 'undefined') return;

    this.platform = this.getPlatformKey();
    this.injectStyles(this.platform);

    const settings = await this.sendMessage({ type: 'get-settings' });
    this.enabled = settings?.settings?.enabled ?? true;

    this.chrome.storage.onChanged.addListener((changes: any, area: string) => {
      if (area === 'sync' && changes.enabled) {
        this.enabled = !!changes.enabled.newValue;
        if (this.enabled) {
          if (!this.observer) this.startMutationObserver();
          this.scanVisibleCandidates();
        } else {
          this.removeAllMarkers();
        }
      }
    });

    this.chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
      if (message.type === 'TOGGLE') {
        this.enabled = message.enabled;
        this.enabled ? this.scanVisibleCandidates() : this.removeAllMarkers();
        sendResponse({ ok: true });
      }
    });

    if (!this.enabled) {
      this.removeAllMarkers();
      return;
    }

    this.scanVisibleCandidates();
    this.startMutationObserver();
  }

  private getPlatformKey(): string {
    const host = window.location.hostname;
    if (host.includes('facebook.com')) return 'fb';
    if (host.includes('instagram.com')) return 'ig';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
    if (host.includes('mail.google.com')) return 'gmail';
    if (host.includes('web.telegram.org') || host.includes('t.me')) return 'tg';
    return 'generic';
  }

  private startMutationObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      if (this.enabled) this.scanVisibleCandidates();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.enabled) {
        this.scanVisibleCandidates();
      }
    });
  }

  private onScroll = (): void => {
    if (!this.enabled) return;
    window.requestAnimationFrame(() => this.scanVisibleCandidates());
  };

  private removeAllMarkers(): void {
    document.querySelectorAll('.scamstop-marker').forEach((el) => el.remove());
    document
      .querySelectorAll(`[${SCANNED_ATTR}]`)
      .forEach((el) => {
        el.removeAttribute(SCANNED_ATTR);
        el.classList.remove('scamstop-anchor');
      });
  }

  private scanVisibleCandidates(): void {
    const candidates = this.getPostCandidates();
    for (const el of candidates) {
      if (el.getAttribute(SCANNED_ATTR) === '1' || this.pendingElements.has(el)) continue;

      const hasCandidateParent = candidates.some((other) => other !== el && other.contains(el));
      if (hasCandidateParent) continue;
      if (!this.isElementVisible(el)) continue;

      this.queueElementForScoring(el);
    }
  }

  private queueElementForScoring(element: HTMLElement): void {
    this.pendingElements.add(element);
    window.setTimeout(async () => {
      try {
        element.setAttribute(SCANNED_ATTR, '1');
        await this.scoreAndMark(element);
      } catch {
        element.removeAttribute(SCANNED_ATTR);
      } finally {
        this.pendingElements.delete(element);
      }
    }, 150);
  }

  private getPostCandidates(): HTMLElement[] {
    switch (this.platform) {
      case 'fb':
      case 'ig': {
        const allDivs = Array.from(document.querySelectorAll('div[dir="auto"], div[style*="text-align"]')) as HTMLElement[];
        return allDivs.filter((el) => {
          const text = el.innerText.trim();
          const isRightLength = text.length > 5 && text.length < 2000;
          const isNotHeader = !el.closest('h1, h2, h3, h4, a[role="link"]');
          const isNotUI = !el.closest('button, time, [role="button"]');
          return isRightLength && isNotHeader && isNotUI;
        });
      }
      case 'x':
        return Array.from(document.querySelectorAll('[data-testid="tweet"]')) as HTMLElement[];
      case 'gmail':
        return Array.from(document.querySelectorAll('.adn.ads, .ii.gt')) as HTMLElement[];
      default:
        return Array.from(document.querySelectorAll('article, [role="article"]')) as HTMLElement[];
    }
  }

  private async scoreAndMark(element: HTMLElement): Promise<void> {
    const text = this.extractText(element);
    if (!text || text.length < 10) return;

    const response = await this.sendMessage({ type: 'score-text', payload: { text, url: window.location.hostname } });
    if (response?.ok && response.result) {
      const prob = response.result.scamProbability;
      this.upsertBadge(element, prob);
      await this.saveToHistory({ text, risk: prob, platform: this.platform });
    }
  }

  private upsertBadge(element: HTMLElement, probability: number): void {
    if (element.querySelector('.scamstop-marker')) return;

    element.classList.add('scamstop-anchor');
    const badge = document.createElement('div');
    badge.className = 'scamstop-marker';
    const rounded = Math.round(probability);
    badge.textContent = `RISK: ${rounded}%`;
    badge.setAttribute('data-risk', this.getRiskLevel(rounded));
    badge.onclick = (e) => {
      e.stopPropagation();
      this.showFullContentModal(this.extractText(element), rounded);
    };
    element.appendChild(badge);
  }

  private extractText(element: HTMLElement): string {
    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return '';

    clone.querySelectorAll(
      'script, style, button, svg, img, video, .scamstop-marker, time, h4, [role="link"], .x1i10hfl, .x1rg5omt'
    ).forEach((node) => node.remove());

    const finalText = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    console.log('ScamStop captured content:', finalText);
    return finalText.slice(0, MAX_TEXT_LENGTH);
  }

  private injectStyles(platform: string): void {
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

    if (platform === 'gmail') {
      css += `
        .scamstop-marker { position: absolute; top: 10px; right: 10px; }
      `;
    }

    css += `.scamstop-anchor { position: relative !important; }
            .scamstop-marker { top: 5px; right: 10px; }`;

    style.textContent = css;
    document.head.appendChild(style);
  }

  private showFullContentModal(text: string, risk: number): void {
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
    document.getElementById('ss-close')?.addEventListener('click', () => root.remove());
  }

  private getRiskLevel(p: number): string {
    return p >= 70 ? 'high' : p >= 40 ? 'medium' : 'low';
  }

  private isElementVisible(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  private async sendMessage(msg: any): Promise<any> {
    if (!this.isExtensionContext()) {
      return { ok: false, error: 'Not in extension context' };
    }

    return new Promise((resolve) => {
      this.chrome.runtime.sendMessage(msg, (response: any) => resolve(response));
    });
  }

  private async saveToHistory(item: { text: string; risk: number; platform?: string }): Promise<void> {
    if (!this.isExtensionContext()) return;

    const data = await this.chrome.storage.local.get({ recentDetections: [] });
    const formattedItem = {
      text: item.text,
      risk: item.risk,
      url: item.platform === 'ig' ? 'instagram.com' : item.platform || 'unknown',
      ts: new Date().toISOString()
    };

    const updated = [formattedItem, ...data.recentDetections].slice(0, 20);
    await this.chrome.storage.local.set({ recentDetections: updated });
  }
}
