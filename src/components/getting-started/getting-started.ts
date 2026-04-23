import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UniversalModal } from '../../reusable-components/modals/universal-modal/universal-modal';

@Component({
  selector: 'app-getting-started',
  imports: [CommonModule, UniversalModal],
  templateUrl: './getting-started.html',
  styleUrl: './getting-started.css',
})
export class GettingStarted {
  showModal = false;

  openTermsModal() {
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  acceptTerms() {
    this.showModal = false;
    window.location.hash = '/main';
  }

  goToMain() {
    window.location.hash = '/main';
  }
}
