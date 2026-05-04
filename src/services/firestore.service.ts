import { Injectable } from '@angular/core';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore, Firestore,
  collection, getDocs, getDoc, addDoc, doc,
  query, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { from, Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { AnalyticsData, BarDatum } from './scam-detection.service';

export interface ReportPayload {
  message: string;
  victim_name?: string | null;
  scam_type?: string | null;
  url?: string | null;
  evidence_url?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  suspect_name?: string | null;
  suspect_contact?: string | null;
  amount_lost?: string | null;
}

export interface ReportStatus {
  report_id: string;
  status: 'pending' | 'verified' | 'rejected';
  scam_type: string;
  victim_name: string;
  reported_at: string | null;
  admin_reply?: string | null;
  replied_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private app: FirebaseApp;
  private db: Firestore;

  constructor() {
    // Avoid re-initialising if already done (e.g. hot reload)
    this.app = getApps().length
      ? getApps()[0]
      : initializeApp(environment.firebase);
    this.db = getFirestore(this.app);
  }

  // ── Report submission ──────────────────────────────────────────────────────

  submitReport(payload: ReportPayload): Observable<{ report_id: string; report_status: string }> {
    return from(this._submitReport(payload));
  }

  private async _submitReport(payload: ReportPayload) {
    const doc: Record<string, any> = {
      message:     payload.message,
      reported_at: serverTimestamp(),
      status:      'pending',
    };

    // Only include defined, non-null fields
    const optional: (keyof ReportPayload)[] = [
      'victim_name', 'scam_type', 'url', 'evidence_url',
      'city', 'latitude', 'longitude',
      'suspect_name', 'suspect_contact', 'amount_lost',
    ];
    for (const key of optional) {
      if (payload[key] != null && payload[key] !== '') {
        doc[key] = payload[key];
      }
    }

    const ref = await addDoc(collection(this.db, 'reports'), doc);
    return { report_id: ref.id, report_status: 'pending' };
  }

  // ── Report status lookup ───────────────────────────────────────────────────

  getReportStatus(reportId: string): Observable<ReportStatus> {
    return from(this._getReportStatus(reportId));
  }

  private async _getReportStatus(reportId: string): Promise<ReportStatus> {
    const snap = await getDoc(doc(this.db, 'reports', reportId));
    if (!snap.exists()) {
      const err: any = new Error('Report not found.');
      err.status = 404;
      throw err;
    }
    const d = snap.data();
    const toIso = (ts: any) =>
      ts instanceof Timestamp ? ts.toDate().toISOString() : null;

    return {
      report_id:   snap.id,
      status:      (d['status'] ?? 'pending') as ReportStatus['status'],
      scam_type:   d['scam_type']   ?? '',
      victim_name: d['victim_name'] ?? '',
      reported_at: toIso(d['reported_at']),
      admin_reply: d['admin_reply'] ?? null,
      replied_at:  toIso(d['replied_at']),
    };
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  /**
   * Reads all documents from the `reports` collection and aggregates:
   * - reports_by_day  (last 7 days, Mon–Sun)
   * - reports_by_city (top 10 cities)
   * - reports_by_type (all scam types)
   * - totals          (total / pending / verified / rejected)
   */
  getAnalytics(): Observable<AnalyticsData> {
    return from(this._fetchAnalytics());
  }

  private async _fetchAnalytics(): Promise<AnalyticsData> {
    const snap = await getDocs(
      query(collection(this.db, 'reports'), orderBy('reported_at', 'desc'))
    );

    const dayCount  = new Map<string, number>();
    const cityCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    const totals    = { total: 0, pending: 0, verified: 0, rejected: 0 };

    // Seed the last 7 days with 0 so all days always appear
    const today = new Date();
    const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const label = dayOrder[d.getDay()];
      last7.push(label);
      if (!dayCount.has(label)) dayCount.set(label, 0);
    }

    snap.forEach(docSnap => {
      const d = docSnap.data();
      totals.total++;

      const status = (d['status'] ?? 'pending') as string;
      if (status === 'pending' || status === 'verified' || status === 'rejected') {
        totals[status]++;
      }

      // Day bucket — only count if within last 7 days
      const ts = d['reported_at'] as Timestamp | undefined;
      if (ts) {
        const date = ts.toDate();
        const diffDays = Math.floor(
          (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 6) {
          const label = dayOrder[date.getDay()];
          dayCount.set(label, (dayCount.get(label) ?? 0) + 1);
        }
      }

      // City bucket
      const city = ((d['city'] as string) ?? '').trim();
      if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);

      // Scam type bucket
      const type = ((d['scam_type'] as string) ?? '').trim();
      if (type) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
    });

    // Build ordered day array (preserve last-7-days order)
    const reports_by_day: BarDatum[] = last7.map(label => ({
      label,
      value: dayCount.get(label) ?? 0
    }));

    // Top 10 cities
    const reports_by_city: BarDatum[] = [...cityCount.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // All scam types sorted by count
    const reports_by_type: BarDatum[] = [...typeCount.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    return { reports_by_day, reports_by_city, reports_by_type, totals };
  }
}
