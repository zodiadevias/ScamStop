import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface ScamDetectionResult {
  is_scam: boolean;
  scam_probability: number;
}

@Injectable({ providedIn: 'root' })
export class ScamDetectionService {
  private apiUrl = 'http://localhost:3000/api';
  modelAvailable = signal(true);

  constructor(private http: HttpClient) {}

  detectScam(message: string): Observable<ScamDetectionResult> {
    return this.http.post<ScamDetectionResult>(`${this.apiUrl}/detect`, { message });
  }

  // This is the missing link!
  updateModelWithReport(message: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/update-index`, { message });
  }
}