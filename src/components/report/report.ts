import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScamDetectionService } from '../../services/scam-detection.service';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report.html',
  styleUrl: './report.css',
})
export class Report {
  reportText = signal('');
  submitting = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  constructor(private scamDetection: ScamDetectionService) {}

  submitReport() {
    const message = this.reportText().trim();
    if (!message) {
      this.errorMessage.set('Please provide details about the suspected scam.');
      return;
    }

    this.submitting.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.scamDetection.updateModelWithReport(message).subscribe({
      next: () => {
        this.successMessage.set('Thank you! Your report has been submitted successfully.');
        this.reportText.set('');
        this.submitting.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to submit your report right now. Please try again later.');
        this.submitting.set(false);
      }
    });
  }
}
