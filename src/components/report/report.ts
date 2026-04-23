import { Component, signal } from '@angular/core';
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
    { value: 'messenger', label: 'Messenger', icon: '📨' },
    { value: 'facebook', label: 'Facebook', icon: '📘' },
    { value: 'sms', label: 'SMS', icon: '📱' },
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
   * Detect scam when message changes
   */
  onMessageChange(value: string) {
    this.message.set(value);
    
    // Run detection when message is at least 10 characters
    if (value.length >= 10) {
      this.detectScam(value);
    } else {
      this.detectionResult.set(null);
    }
  }

  /**
   * Run AI scam detection
   */
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
   * Get traffic light color based on probability
   */
  getTrafficLightColor(probability: number): string {
    if (probability >= 70) return '#ff4444';
    if (probability >= 30) return '#ffbb33';
    return '#00C851';
  }

  /**
   * Get traffic light label
   */
  getTrafficLightLabel(probability: number): string {
    if (probability >= 70) return 'High Risk';
    if (probability >= 30) return 'Caution';
    return 'Safe';
  }

  submitReport() {
    if (!this.phoneNumber() || !this.message()) {
      alert('Please fill in all fields');
      return;
    }

    this.isSubmitting.set(true);

    // Create report entry
    const newReport: ReportEntry = {
      number: this.phoneNumber(),
      message: this.message(),
      platform: this.platform(),
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    // Save to localStorage
    const current = this.reports();
    const updated = [newReport, ...current];
    this.reports.set(updated);
    localStorage.setItem('scamstop_reports', JSON.stringify(updated));

    // Simulate submission delay
    setTimeout(() => {
      this.isSubmitting.set(false);
      this.submitted.set(true);
      
      // Reset form after showing success
      setTimeout(() => {
        this.submitted.set(false);
        this.phoneNumber.set('');
        this.message.set('');
      }, 3000);
    }, 1500);
  }

  deleteReport(index: number) {
    const current = this.reports();
    const updated = current.filter((_, i) => i !== index);
    this.reports.set(updated);
    localStorage.setItem('scamstop_reports', JSON.stringify(updated));
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'submitted': return 'status-submitted';
      case 'reviewed': return 'status-reviewed';
      default: return '';
    }
  }
}
