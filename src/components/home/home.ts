import { Component, OnInit, signal } from '@angular/core';
import { ContentScriptService } from '../../services/content-script.service';
import { ExtensionService } from '../../services/extension.service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  isScanning = signal(true);
  animateShield = signal(false);

  constructor(
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
