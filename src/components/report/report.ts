import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScamDetectionService, ScamDetectionResult } from '../../services/scam-detection.service';

interface ReportEntry {
  number: string;
  message: string;
  timestamp: string;
  platform: string;
  status: string;
}

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report.html',
  styleUrl: './report.css',
})
export class Report {
  // Form signals
  phoneNumber = signal('');
  message = signal('');
  platform = signal('whatsapp');
  isSubmitting = signal(false);
  submitted = signal(false);

  // AI Detection signals
  detectionResult = signal<ScamDetectionResult | null>(null);
  isDetecting = signal(false);

  // Reports history
  reports = signal<ReportEntry[]>([]);

  platforms = [
    { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { value: 'sms', label: 'SMS', icon: '📱' },
    { value: 'messenger', label: 'Messenger', icon: '📨' },
    { value: 'email', label: 'Email', icon: '📧' },
    { value: 'other', label: 'Other', icon: '📎' }
  ];

  constructor(public scamDetection: ScamDetectionService) {
    this.loadReports();
  }

  loadReports() {
    const stored = localStorage.getItem('scamstop_reports');
    if (stored) {
      this.reports.set(JSON.parse(stored));
    }
  }

  /**
   * Triggers when user types in the textarea
   */
  onMessageChange(value: string) {
    this.message.set(value);
    
    // Run detection when message is at least 5 characters for better responsiveness
    if (value.length >= 5) {
      this.detectScam(value);
    } else {
      this.detectionResult.set(null);
    }
  }

  detectScam(message: string) {
    this.isDetecting.set(true);
    this.scamDetection.detectScam(message).subscribe({
      next: (result) => {
        this.detectionResult.set(result);
        this.isDetecting.set(false);
      },
      error: () => {
        this.isDetecting.set(false);
      }
    });
  }

  /**
   * HELPER FUNCTIONS FOR HTML
   */

  // Inside report.component.ts

getTrafficLightColor(probability: number): string {
  // Raise the "Red" threshold from 70 to 85
  if (probability >= 85) return '#ff4444'; 
  // Raise the "Orange" threshold from 30 to 60
  if (probability >= 60) return '#ffbb33'; 
  return '#00C851'; // Green for everything else
}

getTrafficLightLabel(probability: number): string {
  if (probability >= 85) return 'High Risk';
  if (probability >= 60) return 'Suspicious';
  return 'Likely Safe';
}

  // Controls the CSS class for the status badges in history
  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'submitted': return 'status-submitted';
      case 'pending': return 'status-pending';
      case 'reviewed': return 'status-reviewed';
      default: return 'status-default';
    }
  }

  /**
   * SUBMISSION LOGIC
   */
  submitReport() {
    if (!this.phoneNumber() || !this.message()) return;

    this.isSubmitting.set(true);

    // Sync with the Python AI Backend to update the LSH index
    this.scamDetection.updateModelWithReport(this.message()).subscribe({
      next: () => {
        const newReport: ReportEntry = {
          number: this.phoneNumber(),
          message: this.message(),
          platform: this.platform(),
          timestamp: new Date().toISOString(),
          status: 'submitted'
        };

        // Update local state and storage
        const updated = [newReport, ...this.reports()];
        this.reports.set(updated);
        localStorage.setItem('scamstop_reports', JSON.stringify(updated));

        this.isSubmitting.set(false);
        this.submitted.set(true);
        
        // Reset the form UI after 3 seconds
        setTimeout(() => {
          this.submitted.set(false);
          this.phoneNumber.set('');
          this.message.set('');
          this.detectionResult.set(null);
        }, 3000);
      },
      error: (err) => {
        console.error("Cloud sync failed", err);
        alert("Could not sync with PNP database. Please check your connection.");
        this.isSubmitting.set(false);
      }
    });
  }

  deleteReport(index: number) {
    const updated = this.reports().filter((_, i) => i !== index);
    this.reports.set(updated);
    localStorage.setItem('scamstop_reports', JSON.stringify(updated));
  }
}