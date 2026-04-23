import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ReportEntry {
  number: string;
  message: string;
  timestamp: string;
  platform: string;
  status: string;
}

interface DetectionStats {
  date: string;
  count: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class Analytics implements OnInit {
  // Data signals
  reports = signal<ReportEntry[]>([]);
  detections = signal<number>(0);
  blacklist = signal<string[]>([]);

  // Computed stats
  totalReports = computed(() => this.reports().length);
  pendingReports = computed(() => this.reports().filter(r => r.status === 'pending').length);
  submittedReports = computed(() => this.reports().filter(r => r.status === 'submitted').length);

  platformStats = computed(() => {
    const stats: Record<string, number> = {};
    this.reports().forEach(r => {
      stats[r.platform] = (stats[r.platform] || 0) + 1;
    });
    return stats;
  });

  dailyStats = computed((): DetectionStats[] => {
    const stats: Record<string, number> = {};
    this.reports().forEach(r => {
      const date = new Date(r.timestamp).toLocaleDateString();
      stats[date] = (stats[date] || 0) + 1;
    });
    return Object.entries(stats).map(([date, count]) => ({ date, count }));
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    const storedReports = localStorage.getItem('scamstop_reports');
    const storedDetections = localStorage.getItem('scamstop_detections');
    const storedBlacklist = localStorage.getItem('scamstop_blacklist');

    if (storedReports) {
      this.reports.set(JSON.parse(storedReports));
    }
    if (storedDetections) {
      this.detections.set(parseInt(storedDetections, 10));
    }
    if (storedBlacklist) {
      const blacklist = JSON.parse(storedBlacklist);
      this.blacklist.set(blacklist.map((e: any) => e.number));
    }
  }

  getPlatformIcon(platform: string): string {
    const icons: Record<string, string> = {
      whatsapp: '💬',
      messenger: '📨',
      facebook: '📘',
      sms: '📱',
      email: '📧',
      other: '📎'
    };
    return icons[platform] || '📎';
  }

  getMaxCount(): number {
    const counts = this.dailyStats().map(s => s.count);
    return Math.max(...counts, 1);
  }

  getBarHeight(count: number): number {
    return (count / this.getMaxCount()) * 100;
  }
}
