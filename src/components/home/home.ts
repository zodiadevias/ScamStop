import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface BlacklistEntry {
  number: string;
  addedAt: string;
}

interface ReportEntry {
  number: string;
  message: string;
  timestamp: string;
  status: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  // Signals for reactive state
  blacklist = signal<BlacklistEntry[]>([]);
  reports = signal<ReportEntry[]>([]);
  detections = signal<number>(0);
  extensionInstalled = signal<boolean>(false);

  ngOnInit() {
    this.loadData();
    this.checkExtensionStatus();
  }

  loadData() {
    // Load from localStorage (shared with extension)
    const storedBlacklist = localStorage.getItem('scamstop_blacklist');
    const storedReports = localStorage.getItem('scamstop_reports');
    const storedDetections = localStorage.getItem('scamstop_detections');

    if (storedBlacklist) {
      this.blacklist.set(JSON.parse(storedBlacklist));
    }
    if (storedReports) {
      this.reports.set(JSON.parse(storedReports));
    }
    if (storedDetections) {
      this.detections.set(parseInt(storedDetections, 10));
    }
  }

  checkExtensionStatus() {
    // Check if extension is installed via chrome API
    const win = window as unknown as { chrome?: { runtime?: { sendMessage?: (msg: object, cb: (res: string) => void) => void } } };
    if (win.chrome?.runtime?.sendMessage) {
      win.chrome.runtime.sendMessage({ type: 'PING' }, (response: string) => {
        this.extensionInstalled.set(response === 'PONG');
      });
    }
  }

  removeFromBlacklist(number: string) {
    const current = this.blacklist();
    const updated = current.filter(e => e.number !== number);
    this.blacklist.set(updated);
    localStorage.setItem('scamstop_blacklist', JSON.stringify(updated));
  }

  clearAllData() {
    if (confirm('Clear all data? This cannot be undone.')) {
      localStorage.removeItem('scamstop_blacklist');
      localStorage.removeItem('scamstop_reports');
      localStorage.removeItem('scamstop_detections');
      this.blacklist.set([]);
      this.reports.set([]);
      this.detections.set(0);
    }
  }

  getStatusColor(probability: number): string {
    if (probability >= 70) return '#ff4444';
    if (probability >= 30) return '#ffbb33';
    return '#00C851';
  }

  getStatusLabel(probability: number): string {
    if (probability >= 70) return 'High Risk';
    if (probability >= 30) return 'Caution';
    return 'Safe';
  }
}
