import { Injectable } from '@angular/core';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore, Firestore,
  collection, getDocs, query, orderBy, Timestamp
} from 'firebase/firestore';
import { from, Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { AnalyticsData, BarDatum } from './scam-detection.service';

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

    snap.forEach(doc => {
      const d = doc.data();
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
