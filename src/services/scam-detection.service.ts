import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '../environments/environment';

export interface ScamDetectionResult {
  is_scam: boolean;
  confidence: number;
  scam_probability: number;
  safe_probability: number;
}

export interface ModelHealth {
  status: string;
  model_loaded: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ScamDetectionService {
  private apiUrl = environment.apiUrl;
  private highRiskThreshold = environment.thresholds.highRisk;

  // Cache for results
  lastResult = signal<ScamDetectionResult | null>(null);
  isLoading = signal(false);
  error = signal<string | null>(null);
  modelHealth = signal<ModelHealth | null>(null);
  modelAvailable = signal(true);

  constructor(private http: HttpClient) {
    this.checkHealth().subscribe({
      next: (health) => {
        this.modelHealth.set(health);
        this.modelAvailable.set(health.model_loaded);
      },
      error: () => {
        this.modelAvailable.set(false);
      }
    });
  }

  /**
   * Detect if a message is a scam using the AI model
   */
  detectScam(message: string): Observable<ScamDetectionResult> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http.post<ScamDetectionResult>(`${this.apiUrl}/detect`, { message }).pipe(
      tap(result => {
        this.lastResult.set(result);
      }),
      catchError(err => {
        console.error('Scam detection error:', err);
        this.error.set('Failed to connect to AI model. Using fallback detection.');
        this.modelAvailable.set(false);
        return of(this.fallbackDetection(message));
      })
    );
  }

  /**
   * Fallback detection when API is unavailable
   * Uses keyword-based detection as backup
   */
  private fallbackDetection(message: string): ScamDetectionResult {
    const lowerMessage = message.toLowerCase();
    
    // Scam keywords
    const scamKeywords = [
      'winner', 'prize', 'lottery', 'congratulations', 'you won',
      'claim now', 'urgent', 'act now', 'limited time',
      'free gift', 'click here', 'verify your account',
      'suspend', 'locked', 'compromised', 'suspicious activity',
      'job offer', 'work from home', 'easy money', 'salary',
      'bank', 'account', 'verify', 'update', 'confirm',
      'otp', 'one-time', 'password', 'login', 'sign in',
      'bitcoin', 'crypto', 'investment', 'double your money',
      'inheritance', 'million', 'billion', 'abroad', 'beneficiary'
    ];

    // Count matches
    let matches = 0;
    for (const keyword of scamKeywords) {
      if (lowerMessage.includes(keyword)) {
        matches++;
      }
    }

    // Calculate probability
    const probability = Math.min(matches * 15, 100);
    const is_scam = probability >= this.highRiskThreshold;

    return {
      is_scam,
      confidence: probability,
      scam_probability: probability,
      safe_probability: 100 - probability
    };
  }

  /**
   * Check if the AI model API is available
   */
  checkHealth(): Observable<{ status: string; model_loaded: boolean }> {
    return this.http.get<{ status: string; model_loaded: boolean }>(`${this.apiUrl}/health`);
  }

  /**
   * Get traffic light status based on probability
   */
  getTrafficLight(probability: number): 'red' | 'yellow' | 'green' {
    if (probability >= 70) return 'red';
    if (probability >= 30) return 'yellow';
    return 'green';
  }
}