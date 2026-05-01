import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

const DEFAULT_SETTINGS = {
  enabled: false,
  apiBase: environment.apiUrl
};

export interface ExtensionSettings {
  enabled: boolean;
  apiBase: string;
}

export interface ExtensionStats {
  scanned: number;
  flagged: number;
  safe: number;
}

export interface DetectionEntry {
  risk: number;
  text: string;
  ts: string;
  url: string;
}

export interface ScamApiResult {
  scamProbability: number;
  isScam: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExtensionService {
  constructor(private http: HttpClient) {}

  private get chrome(): any {
    return typeof window !== 'undefined' ? (window as any).chrome : undefined;
  }

  isExtensionContext(): boolean {
    return !!this.chrome && !!this.chrome.runtime;
  }

  async initializeDefaultSettings(): Promise<void> {
    if (!this.isExtensionContext()) return;

    const current = await this.chrome.storage.sync.get([
      'enabled',
      'apiBase',
      'stats',
      'detections'
    ]);

    const nextSettings = {
      enabled:
        typeof current.enabled === 'boolean'
          ? current.enabled
          : DEFAULT_SETTINGS.enabled,
      apiBase:
        typeof current.apiBase === 'string' && current.apiBase.trim()
          ? current.apiBase.trim()
          : DEFAULT_SETTINGS.apiBase,
      stats: current.stats || { scanned: 0, flagged: 0, safe: 0 },
      detections: current.detections || []
    };

    await this.chrome.storage.sync.set(nextSettings);
  }

  async getSettings(): Promise<{
    settings: ExtensionSettings;
    stats: ExtensionStats;
    detections: DetectionEntry[];
  }> {
    if (!this.isExtensionContext()) {
      return {
        settings: DEFAULT_SETTINGS,
        stats: { scanned: 0, flagged: 0, safe: 0 },
        detections: []
      };
    }

    // Settings live in sync; stats + detections live in local
    const [sync, local] = await Promise.all([
      this.chrome.storage.sync.get(['enabled', 'apiBase']),
      this.chrome.storage.local.get(['stats', 'recentDetections']),
    ]);

    return {
      settings: {
        enabled: typeof sync.enabled === 'boolean' ? sync.enabled : DEFAULT_SETTINGS.enabled,
        apiBase: sync.apiBase || DEFAULT_SETTINGS.apiBase,
      },
      stats: local.stats || { scanned: 0, flagged: 0, safe: 0 },
      detections: local.recentDetections || [],
    };
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.isExtensionContext()) return false;

    await this.chrome.storage.sync.set({ enabled: !!enabled });
    return true;
  }

  async toggleEnabled(enabled: boolean): Promise<boolean> {
    if (!this.isExtensionContext()) return false;

    const saved = await this.setEnabled(enabled);
    await this.broadcastToggle(enabled);
    return saved;
  }

  private async broadcastToggle(enabled: boolean): Promise<void> {
    if (!this.isExtensionContext() || !this.chrome.tabs) return;

    if (typeof this.chrome.tabs.query === 'function') {
      this.chrome.tabs.query({}, (tabs: any[]) => {
        if (!Array.isArray(tabs)) return;
        for (const tab of tabs) {
          if (!tab?.id) continue;
          try {
            this.chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE', enabled });
          } catch (error) {
            console.warn('ScamStop toggle broadcast failed for tab', tab.id, error);
          }
        }
      });
    }
  }

  async setApiBase(apiBase: string): Promise<boolean> {
    if (!this.isExtensionContext()) return false;

    const value = String(apiBase || '').trim();
    if (!value) return false;

    await this.chrome.storage.sync.set({ apiBase: value });
    return true;
  }

  async scoreText(payload: { text: string; url?: string }): Promise<ScamApiResult> {
    const text = String(payload?.text || '').trim();
    if (!text) {
      throw new Error('No text to score.');
    }

    const { settings } = await this.getSettings();
    const url = `${settings.apiBase}/api/detect`;

    const response = await firstValueFrom(
      this.http.post<{ is_scam: boolean; scam_probability: number }>(url, {
        message: text
      })
    );

    return {
      scamProbability: Number(response?.scam_probability || 0),
      isScam: !!response?.is_scam
    };
  }

  async scoreAndRecord(payload: { text: string; url?: string }): Promise<ScamApiResult> {
    const result = await this.scoreText(payload);

    if (!this.isExtensionContext()) {
      return result;
    }

    const data = await this.chrome.storage.sync.get(['stats', 'detections']);
    const stats: ExtensionStats = data.stats || {
      scanned: 0,
      flagged: 0,
      safe: 0
    };
    const detections: DetectionEntry[] = data.detections || [];

    stats.scanned++;
    if (result.isScam) {
      stats.flagged++;
    } else {
      stats.safe++;
    }

    const newEntry: DetectionEntry = {
      risk: result.scamProbability,
      text: payload.text,
      ts: Date.now().toString(),
      url: payload.url || 'Unknown Page'
    };

    detections.push(newEntry);
    if (detections.length > 30) detections.shift();

    await this.chrome.storage.sync.set({ stats, detections });
    return result;
  }

  async saveToHistory(item: {
    text: string;
    risk: number;
    platform?: string;
  }): Promise<void> {
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

  sendMessage(message: any): Promise<any> {
    if (!this.isExtensionContext()) {
      return Promise.resolve({ ok: false, error: 'Not running in extension context' });
    }

    return new Promise((resolve) => {
      this.chrome.runtime.sendMessage(message, (response: any) => {
        resolve(response);
      });
    });
  }
}

