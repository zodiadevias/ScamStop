import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { UniversalModal } from '../../reusable-components/modals/universal-modal/universal-modal';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, UniversalModal],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  private readonly onboardingSeenKey = 'scamstop_onboarding_seen';
  showTerms = signal(false);
  appVersion = 'v1.0.0';

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
    }
  ];

  partners = [
    { name: 'Philippine National Police', icon: '🏛️', description: 'Police Station 3, Olongapo City' }
  ];

  constructor(private router: Router) {}

  openTermsModal() {
    this.showTerms.set(true);
  }

  closeTermsModal() {
    this.showTerms.set(false);
  }

  resetOnboarding() {
    localStorage.removeItem(this.onboardingSeenKey);
    this.router.navigateByUrl('/');
  }
}
