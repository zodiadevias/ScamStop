import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { ExtensionService } from '../../services/extension.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  showDetectionMethod = signal(true);

  constructor(
    private router: Router,
    public themeService: ThemeService,
    private extensionService: ExtensionService,
  ) {}

  async ngOnInit(): Promise<void> {
    const { settings } = await this.extensionService.getSettings();
    this.showDetectionMethod.set(settings.showDetectionMethod);
  }

  toggleLightMode(): void {
    this.themeService.toggleLightMode();
  }

  async toggleDetectionMethod(): Promise<void> {
    const next = !this.showDetectionMethod();
    this.showDetectionMethod.set(next);
    await this.extensionService.setShowDetectionMethod(next);
  }

  goToAbout(): void {
    this.router.navigateByUrl('/main/about');
  }
}
