import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { UniversalModal } from '../../reusable-components/modals/universal-modal/universal-modal';

@Component({
  selector: 'app-getting-started',
  imports: [CommonModule, UniversalModal],
  templateUrl: './getting-started.html',
  styleUrl: './getting-started.css',
})
export class GettingStarted implements OnInit {
  private readonly onboardingSeenKey = 'scamstop_onboarding_seen';
  showModal = false;

  constructor(private router: Router) {}

  ngOnInit() {
    const hasSeenOnboarding = localStorage.getItem(this.onboardingSeenKey) === 'true';
    if (hasSeenOnboarding) {
      this.router.navigateByUrl('/main/home');
    }
  }

  openTermsModal() {
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  acceptTerms() {
    this.showModal = false;
    this.markOnboardingAsSeen();
    this.router.navigateByUrl('/main/home');
  }

  goToMain() {
    this.markOnboardingAsSeen();
    this.router.navigateByUrl('/main/home');
  }

  private markOnboardingAsSeen() {
    localStorage.setItem(this.onboardingSeenKey, 'true');
  }
}
