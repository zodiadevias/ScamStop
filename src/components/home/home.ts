import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ContentScriptService } from '../../services/content-script.service';
import { ExtensionService } from '../../services/extension.service';

interface DetectionSample {
  message: string;
  date: string;
  platform: string;
  risk: number;
}

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  isScanning = signal(false);
  animateShield = signal(true);
  selectedDetection = signal<DetectionSample | null>(null);
  recentDetections: DetectionSample[] = [
    {
      message: 'Urgent: Your account is suspended. Verify now at bit.ly/secure-login.',
      date: 'Apr 26, 2026',
      platform: 'Facebook',
      risk: 91
    },
    {
      message: 'Congratulations! Claim your cash prize by paying a processing fee.',
      date: 'Apr 26, 2026',
      platform: 'SMS',
      risk: 86
    },
    {
      message: 'fake-delivery-support.com.',
      date: 'Apr 25, 2026',
      platform: 'URL',
      risk: 78
    },
    {
      message: 'Hi, this is support. Send your OTP so we can unlock your account.',
      date: 'Apr 25, 2026',
      platform: 'Instagram',
      risk: 88
    },
    {
      message: 'Investment alert: Guaranteed 20% daily returns. Limited slots only.',
      date: 'Apr 24, 2026',
      platform: 'Messenger',
      risk: 93
    },
    {
      message: 'Bank notice: Your card has been blocked, confirm identity immediately.',
      date: 'Apr 24, 2026',
      platform: 'Email',
      risk: 84
    }
  ];

  constructor(
    private router: Router,
    private extensionService: ExtensionService,
    private contentScriptService: ContentScriptService
  ) {}

  async ngOnInit(): Promise<void> {
    const { settings } = await this.extensionService.getSettings();
    this.isScanning.set(settings.enabled);

    if (this.contentScriptService.isExtensionContext()) {
      await this.contentScriptService.initContentScript();
    }
  }

  async toggleScanning() {
    const nextState = !this.isScanning();
    this.isScanning.set(nextState);
    await this.extensionService.toggleEnabled(nextState);
    this.playShieldAnimation();
  }

  onShieldAnimationEnd() {
    this.animateShield.set(false);
  }

  openDetection(item: DetectionSample): void {
    this.selectedDetection.set(item);
  }

  closeDetection(): void {
    this.selectedDetection.set(null);
  }

  goToReportFromDetection(message: string): void {
    const encodedMessage = encodeURIComponent(message);
    this.closeDetection();
    this.router.navigateByUrl(`/main/report?message=${encodedMessage}`);
  }

  previewMessage(message: string): string {
    const trimmed = message.trim();
    if (trimmed.length <= 50) return trimmed;
    return `${trimmed.slice(0, 50)}...`;
  }

  private playShieldAnimation() {
    this.animateShield.set(false);
    requestAnimationFrame(() => {
      this.animateShield.set(true);
    });
  }


  totalScanned = 2000;
  totalFlagged = 1000;
  totalSafe = 1000;




}
