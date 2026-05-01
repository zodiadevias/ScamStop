import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ScamDetectionService, PerformanceData, BarDatum } from '../../services/scam-detection.service';
import { FirestoreService } from '../../services/firestore.service';
import { AnalyticsData } from '../../services/scam-detection.service';

interface MetricDatum {
  label: string;
  percent: number;
}

@Component({
  selector: 'app-analytics',
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class Analytics implements OnInit {
  private svc       = inject(ScamDetectionService);
  private firestore = inject(FirestoreService);

  // ── Report analytics (from Firestore via API) ──────────────────────────
  reportsByDay  = signal<BarDatum[]>([]);
  reportsByCity = signal<BarDatum[]>([]);
  reportsByType = signal<BarDatum[]>([]);
  totals        = signal<{ total: number; pending: number; verified: number; rejected: number } | null>(null);
  analyticsLoading = signal(true);
  analyticsError   = signal<string | null>(null);

  // ── Model performance (untouched) ──────────────────────────────────────
  modelPerformance = signal<MetricDatum[]>([]);
  metricsLoading   = signal(false);
  metricsError     = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAnalytics();
    this.loadMetrics();
  }

  // ── Analytics ──────────────────────────────────────────────────────────

  loadAnalytics(): void {
    this.analyticsLoading.set(true);
    this.analyticsError.set(null);

    this.firestore.getAnalytics().subscribe({
      next: (data: AnalyticsData) => {
        this.reportsByDay.set(data.reports_by_day   ?? []);
        this.reportsByCity.set(data.reports_by_city ?? []);
        this.reportsByType.set(data.reports_by_type ?? []);
        this.totals.set(data.totals ?? null);
        this.analyticsLoading.set(false);
      },
      error: (err: Error) => {
        this.analyticsError.set(err?.message ?? 'Could not load analytics.');
        this.analyticsLoading.set(false);
      }
    });
  }

  maxValue(items: BarDatum[]): number {
    return Math.max(...items.map(i => i.value), 1);
  }

  barWidth(value: number, items: BarDatum[]): number {
    return (value / this.maxValue(items)) * 100;
  }

  // ── Model metrics (untouched) ──────────────────────────────────────────

  loadMetrics(): void {
    this.metricsLoading.set(true);
    this.metricsError.set(null);

    this.svc.fetchMetrics().subscribe({
      next: (data: PerformanceData) => {
        this.modelPerformance.set(this.mapPerformanceData(data));
        this.metricsLoading.set(false);
      },
      error: (err: Error) => {
        this.metricsError.set(err?.message ?? 'Could not load model metrics.');
        this.metricsLoading.set(false);
      }
    });
  }

  private mapPerformanceData(data: PerformanceData): MetricDatum[] {
    const m = data?.performance_metrics;
    if (!m) return [];
    const toPercent = (val: number | null) =>
      val == null ? 0 : Math.round(val > 1 ? val : val * 100);
    return [
      { label: 'Accuracy',  percent: toPercent(m.accuracy) },
      { label: 'Precision', percent: toPercent(m.precision) },
      { label: 'Recall',    percent: toPercent(m.recall) },
      { label: 'F1-Score',  percent: toPercent(m.f1_score) },
      { label: 'AUC-ROC',   percent: toPercent(m.auc_roc) },
    ];
  }
}
