import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

interface BarDatum {
  label: string;
  value: number;
}

interface MetricDatum {
  label: string;
  percent: number;
}

export interface AnalyticsPayload {
  userDailyReports?: BarDatum[];
  areaReports?: BarDatum[];
  modelPerformance?: MetricDatum[];
}

const DEFAULT_ANALYTICS_DATA: AnalyticsPayload = {
  userDailyReports: [
    { label: 'Mon', value: 3 },
    { label: 'Tue', value: 5 },
    { label: 'Wed', value: 2 },
    { label: 'Thu', value: 6 },
    { label: 'Fri', value: 4 },
    { label: 'Sat', value: 7 },
    { label: 'Sun', value: 3 }
  ],
  areaReports: [
    { label: 'Olongapo', value: 18 },
    { label: 'Subic', value: 11 },
    { label: 'Castillejos', value: 8 },
    { label: 'Dinalupihan', value: 6 },
    { label: 'San Marcelino', value: 4 }
  ],
  modelPerformance: [
    { label: 'Precision', percent: 92 },
    { label: 'Recall', percent: 88 },
    { label: 'F1-Score', percent: 90 },
    { label: 'LSH Match Quality', percent: 85 }
  ]
};

@Component({
  selector: 'app-analytics',
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class Analytics {
  userDailyReports: BarDatum[] = [];
  areaReports: BarDatum[] = [];
  modelPerformance: MetricDatum[] = [];
  private maxUserDailyReports = 1;
  private maxAreaReports = 1;

  @Input() set analyticsData(payload: AnalyticsPayload | null | undefined) {
    this.applyPayload(payload, true);
  }

  constructor() {
    this.applyPayload(DEFAULT_ANALYTICS_DATA, false);
  }

  userDailyWidth(value: number): number {
    return (value / this.maxUserDailyReports) * 100;
  }

  areaReportWidth(value: number): number {
    return (value / this.maxAreaReports) * 100;
  }

  private applyPayload(
    payload: AnalyticsPayload | null | undefined,
    useFallbackForMissingData: boolean
  ): void {
    const fallback = useFallbackForMissingData ? DEFAULT_ANALYTICS_DATA : undefined;

    this.userDailyReports = this.normalizeBars(payload?.userDailyReports, fallback?.userDailyReports);
    this.areaReports = this.normalizeBars(payload?.areaReports, fallback?.areaReports);
    this.modelPerformance = this.normalizeMetrics(
      payload?.modelPerformance,
      fallback?.modelPerformance
    );

    this.maxUserDailyReports = Math.max(...this.userDailyReports.map((item) => item.value), 1);
    this.maxAreaReports = Math.max(...this.areaReports.map((item) => item.value), 1);
  }

  private normalizeBars(source: BarDatum[] | undefined, fallback?: BarDatum[]): BarDatum[] {
    const effectiveSource = Array.isArray(source) && source.length > 0 ? source : (fallback ?? []);

    if (!Array.isArray(effectiveSource)) return [];
    return effectiveSource
      .filter((item) => item && typeof item.label === 'string')
      .map((item) => ({
        label: item.label.trim(),
        value: this.toNonNegativeNumber(item.value)
      }));
  }

  private normalizeMetrics(source: MetricDatum[] | undefined, fallback?: MetricDatum[]): MetricDatum[] {
    const effectiveSource = Array.isArray(source) && source.length > 0 ? source : (fallback ?? []);

    if (!Array.isArray(effectiveSource)) return [];
    return effectiveSource
      .filter((item) => item && typeof item.label === 'string')
      .map((item) => ({
        label: item.label.trim(),
        percent: Math.min(100, this.toNonNegativeNumber(item.percent))
      }));
  }

  private toNonNegativeNumber(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, numeric);
  }
}
