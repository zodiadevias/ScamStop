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

    document.documentElement.classList.toggle('light-mode', enabled);
    document.body.classList.toggle('light-mode', enabled);

    // Inject/remove a <style> tag that forces text black in light mode.
    // This is the only reliable approach in extension popups where Angular's
    // scoped component styles always win over external stylesheets.
    const STYLE_ID = 'scamstop-light-mode-override';
    const existing = document.getElementById(STYLE_ID);

    if (enabled) {
      if (!existing) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
          * { color: #111827 !important; }
          input, select, textarea { background: #f8fafc !important; border-color: rgba(15,23,42,0.18) !important; }
          input::placeholder, textarea::placeholder { color: #6b7280 !important; }
          .eyebrow { color: #0369a1 !important; }
          .section-label { color: #0369a1 !important; }
          .required { color: #f87171 !important; }
          .risk-badge-high, .risk-badge-high * { color: #450a0a !important; }
          .risk-badge-medium, .risk-badge-medium * { color: #451a03 !important; }
          .risk-badge-low, .risk-badge-low * { color: #022c22 !important; }
          .platform-badge, .platform-badge * { color: #082f49 !important; }
          .lookup-btn, .lookup-btn * { color: #082f49 !important; }
          .actions button, .actions button * { color: #0b1120 !important; }
          .about-btn, .about-btn * { color: #082f49 !important; }
          .toggle-btn.active, .toggle-btn.active * { color: #052e16 !important; }
          .modal-report-btn, .modal-report-btn * { color: #082f49 !important; }
          .status-badge.status-pending, .status-badge.status-pending * { color: #92400e !important; }
          .status-badge.status-verified, .status-badge.status-verified * { color: #065f46 !important; }
          .status-badge.status-rejected, .status-badge.status-rejected * { color: #991b1b !important; }
          .lookup-result.status-pending, .lookup-result.status-pending * { color: #92400e !important; }
          .lookup-result.status-verified, .lookup-result.status-verified * { color: #065f46 !important; }
          .lookup-result.status-rejected, .lookup-result.status-rejected * { color: #991b1b !important; }
          .notice.success, .notice.success * { color: #065f46 !important; }
          .notice.error, .notice.error * { color: #991b1b !important; }
          .lookup-error { color: #991b1b !important; }
          .field-error { color: #991b1b !important; }
          .metrics-error, .metrics-error * { color: #991b1b !important; }
          .retry-btn { color: #991b1b !important; }
          .remove-file { color: #991b1b !important; }
          .modal-x { color: #374151 !important; }
        `;
        document.head.appendChild(style);
      }
    } else {
      existing?.remove();
    }
  }
}
