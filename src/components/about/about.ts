import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  private readonly onboardingSeenKey = 'scamstop_onboarding_seen';
  showTerms = signal(false);
  showPrivacy = signal(false);

  features = [
    {
      icon: '🛡️',
      title: 'Real-time Detection',
      description: 'Automatically detects scam messages across platforms using advanced pattern matching'
    },
    {
      icon: '🚨',
      title: 'One-Tap Reporting',
      description: 'Report suspicious messages directly to PNP with a single tap'
    },
    {
      icon: '🚫',
      title: 'Scammer Blacklist',
      description: 'Block and blacklist known scammers to prevent future contact'
    },
    {
      icon: '📊',
      title: 'Analytics Dashboard',
      description: 'Track scam trends and reporting statistics over time'
    },
    {
      icon: '🔌',
      title: 'Browser Extension',
      description: 'Protect yourself while browsing WhatsApp, Messenger, Facebook, and more'
    },
    {
      icon: '🏛️',
      title: 'PNP Partnership',
      description: 'Official partnership with Philippine National Police Cybercrime Unit'
    }
  ];

  partners = [
    { name: 'Philippine National Police', icon: '🏛️', description: 'Cybercrime Unit' },
    { name: 'Olongapo City', icon: '🏙️', description: 'Local Government' }
  ];

  constructor(private router: Router) {}

  toggleTerms() {
    this.showTerms.set(!this.showTerms());
  }

  togglePrivacy() {
    this.showPrivacy.set(!this.showPrivacy());
  }

  resetOnboarding() {
    localStorage.removeItem(this.onboardingSeenKey);
    this.router.navigateByUrl('/');
  }
}
