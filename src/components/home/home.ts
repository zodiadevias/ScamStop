import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ContentScriptService } from '../../services/content-script.service';
import { ExtensionService, DetectionEntry } from '../../services/extension.service';

export interface Detection {
  message: string;
  date: string;
  platform: string;
  risk: number;
  isScam: boolean;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  isScanning    = signal(false);
  animateShield = signal(true);
  selectedDetection = signal<Detection | null>(null);

  recentDetections = signal<Detection[]>([]);
  detectionsLoading = signal(true);

  totalScanned = signal(0);
  totalFlagged = signal(0);
  totalSafe    = signal(0);

  // Derived — only show the 10 most recent
  displayedDetections = computed(() =>
    this.recentDetections().slice(0, 10)
  );

  constructor(
    private router: Router,
    private extensionService: ExtensionService,
    private contentScriptService: ContentScriptService
  ) {}

  async ngOnInit(): Promise<void> {
    const { settings, stats, detections } = await this.extensionService.getSettings();
    this.isScanning.set(settings.enabled);

    // Stats
    this.totalScanned.set(stats.scanned);
    this.totalFlagged.set(stats.flagged);
    this.totalSafe.set(stats.safe);

    // Load real detections from extension storage
    this.loadDetections(detections);

    if (this.contentScriptService.isExtensionContext()) {
      await this.contentScriptService.initContentScript();
    }
  }

  private loadDetections(entries: DetectionEntry[]): void {
    const mapped: Detection[] = entries
      .slice()
      .sort((a, b) => Number(b.ts) - Number(a.ts))  // newest first
      .map(entry => ({
        message:  entry.text,
        date:     this.formatTs(entry.ts),
        platform: entry.url ?? 'Unknown',
        risk:     Math.round(entry.risk),
        isScam:   entry.risk >= 70,
      }));

    this.recentDetections.set(mapped);
    this.detectionsLoading.set(false);
  }

  private formatTs(ts: string): string {
    const ms = Number(ts);
    const d  = isNaN(ms) ? new Date(ts) : new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getRiskLevel(risk: number): 'high' | 'medium' | 'low' {
    if (risk >= 70) return 'high';
    if (risk >= 40) return 'medium';
    return 'low';
  }

  previewMessage(message: string): string {
    const trimmed = message.trim();
    return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 60)}…`;
  }

  // ── Scanning toggle ────────────────────────────────────────────────────────

  async toggleScanning(): Promise<void> {
    const next = !this.isScanning();
    this.isScanning.set(next);
    await this.extensionService.toggleEnabled(next);
    this.playShieldAnimation();
  }

  onShieldAnimationEnd(): void {
    this.animateShield.set(false);
  }

  private playShieldAnimation(): void {
    this.animateShield.set(false);
    requestAnimationFrame(() => this.animateShield.set(true));
  }

  // ── Detection modal ────────────────────────────────────────────────────────

  openDetection(item: Detection): void {
    this.selectedDetection.set(item);
  }

  closeDetection(): void {
    this.selectedDetection.set(null);
  }

  goToReportFromDetection(message: string): void {
    this.closeDetection();
    this.router.navigateByUrl(`/main/report?message=${encodeURIComponent(message)}`);
  }
}
