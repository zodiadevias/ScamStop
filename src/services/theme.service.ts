import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly lightModeKey = 'scamstop_light_mode';
  readonly lightModeEnabled = signal(false);

  initializeTheme(): void {
    const saved = localStorage.getItem(this.lightModeKey);
    const enabled = saved ? JSON.parse(saved) === true : false;
    this.setLightMode(enabled);
  }

  toggleLightMode(): void {
    this.setLightMode(!this.lightModeEnabled());
  }

  private setLightMode(enabled: boolean): void {
    this.lightModeEnabled.set(enabled);
    localStorage.setItem(this.lightModeKey, JSON.stringify(enabled));
    document.body.classList.toggle('light-mode', enabled);
  }
}
