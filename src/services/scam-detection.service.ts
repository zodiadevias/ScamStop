import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, tap, timeout, catchError, throwError } from 'rxjs';
import { environment } from '../environments/environment';

// --- INTERFACES ---
export interface ScamDetectionResult {
  is_scam: boolean;
  scam_probability: number;
  processing_time: string;
  detection_method?: string;
}

export interface BarDatum {
  label: string;
  value: number;
}

export interface AnalyticsData {
  reports_by_day:  BarDatum[];
  reports_by_city: BarDatum[];
  reports_by_type: BarDatum[];
  totals: {
    total:    number;
    pending:  number;
    verified: number;
    rejected: number;
  };
}

export interface PerformanceData {
  performance_metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    auc_roc: number;
    lsh_similarity_threshold: number;
  };
  confusion_matrix: {
    true_negative: number;
    false_positive: number;
    false_negative: number;
    true_positive: number;
  };
  lsh_configurations: {
    hash_functions_k: number;
    bands_b: number;
    rows_per_band_r: number;
    minhash_shingle_size: string;
    vocabulary_size_tfidf: number;
    avg_query_time: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ScamDetectionService {
  // In web context, use the configured API URL directly (no proxy needed)
  private webApiUrl = environment.apiUrl;

  modelAvailable = signal(true);
  latestMetrics = signal<PerformanceData | null>(null);

  constructor(private http: HttpClient) {}

  private get chrome(): any {
    return typeof window !== 'undefined' ? (window as any).chrome : undefined;
  }

  private isExtensionContext(): boolean {
    return !!this.chrome?.runtime?.sendMessage;
  }

  /**
   * Send a message to the background service worker and return a Promise.
   */
  private sendToBackground(message: object): Promise<any> {
    return new Promise((resolve, reject) => {
      this.chrome.runtime.sendMessage(message, (response: any) => {
        if (this.chrome.runtime.lastError) {
          reject(new Error(this.chrome.runtime.lastError.message));
        } else if (!response?.ok) {
          const err = new Error(response?.error ?? 'Background script error');
          (err as any).status = response?.status;
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Detect ─────────────────────────────────────────────────────────────────

  detectScam(message: string): Observable<ScamDetectionResult> {
    if (this.isExtensionContext()) {
      return from(
        this.sendToBackground({ type: 'score-text', payload: { text: message } })
          .then(res => ({
            is_scam: res.result.isScam,
            scam_probability: res.result.scamProbability,
            processing_time: '',
          } as ScamDetectionResult))
      ).pipe(tap({ error: () => this.modelAvailable.set(false) }));
    }

    return this.http.post<ScamDetectionResult>(`${this.webApiUrl}/detect`, { message }).pipe(
      tap({ error: () => this.modelAvailable.set(false) })
    );
  }

  // ── Report ─────────────────────────────────────────────────────────────────

  reportScam(message: string, meta?: {
    victim_name?: string;
    scam_type?: string;
    url?: string | null;
    evidence_url?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    suspect_name?: string | null;
    suspect_contact?: string | null;
    amount_lost?: string | null;
  }): Observable<any> {
    if (this.isExtensionContext()) {
      return from(
        this.sendToBackground({
          type: 'submit-report',
          payload: { message, ...meta }
        }).then(res => res.data)
      );
    }

    return this.http.post(`${this.webApiUrl}/report`, { message, ...meta });
  }

  // ── Report status ──────────────────────────────────────────────────────────

  checkReportStatus(reportId: string): Observable<{
    report_id: string;
    status: 'pending' | 'verified' | 'rejected';
    scam_type: string;
    victim_name: string;
    reported_at: string | null;
    admin_reply?: string | null;
    replied_at?: string | null;
  }> {
    if (this.isExtensionContext()) {
      return from(
        this.sendToBackground({ type: 'get-report-status', reportId })
          .then(res => res.data)
          .catch(err => {
            // Preserve 404 status for the component to handle
            throw err;
          })
      );
    }

    return this.http.get<any>(`${this.webApiUrl}/report/${reportId}`);
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  fetchAnalytics(): Observable<AnalyticsData> {
    if (this.isExtensionContext()) {
      return from(
        this.sendToBackground({ type: 'get-analytics' }).then(res => res.data as AnalyticsData)
      ).pipe(
        catchError(() => of({
          reports_by_day: [], reports_by_city: [],
          reports_by_type: [], totals: { total: 0, pending: 0, verified: 0, rejected: 0 }
        } as AnalyticsData))
      );
    }
    return this.http.get<AnalyticsData>(`${this.webApiUrl}/analytics`).pipe(
      timeout(30000),
      catchError(err => {
        // If endpoint doesn't exist yet (404) or server is waking up,
        // return empty data so the UI shows "No data" instead of an error.
        if (err?.status === 404 || err?.name === 'TimeoutError') {
          return of({
            reports_by_day: [], reports_by_city: [],
            reports_by_type: [], totals: { total: 0, pending: 0, verified: 0, rejected: 0 }
          } as AnalyticsData);
        }
        return throwError(() => new Error('Could not load analytics data.'));
      })
    );
  }

  fetchMetrics(): Observable<PerformanceData> {
    if (this.isExtensionContext()) {
      return from(
        this.sendToBackground({ type: 'get-metrics' }).then(res => res.data as PerformanceData)
      ).pipe(
        tap(data => this.latestMetrics.set(data)),
        catchError(err => {
          const message = err?.message ?? 'Could not load model metrics.';
          return throwError(() => new Error(message));
        })
      );
    }

    return this.http.get<PerformanceData>(`${this.webApiUrl}/metrics`).pipe(
      timeout(60000),
      tap(data => this.latestMetrics.set(data)),
      catchError(err => {
        const message = err?.name === 'TimeoutError'
          ? 'Metrics request timed out. The server may be waking up — try again in a moment.'
          : 'Could not load model metrics.';
        return throwError(() => new Error(message));
      })
    );
  }
}
