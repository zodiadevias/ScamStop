import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FileUploader {
  private uploadUrl = 'https://upload.uploadcare.com/base/';
  private publicKey = environment.uploadcare.publicKey;
  private secretKey = environment.uploadcare.secretKey;

  constructor(private http: HttpClient) {}

  uploadFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('UPLOADCARE_PUB_KEY', this.publicKey);
    formData.append('file', file);

    return this.http.post(this.uploadUrl, formData);
  }

  deleteFile(uuid: string): Observable<any> {
    if (!this.secretKey) {
      throw new Error('Uploadcare secret key not configured. File deletion must be handled server-side.');
    }
    const url = `https://api.uploadcare.com/files/${uuid}/`;
    const headers = new HttpHeaders({
      'Authorization': `Uploadcare.Simple ${this.publicKey}:${this.secretKey}`,
      'Accept': 'application/vnd.uploadcare-v0.5+json'
    });

    return this.http.delete(url, { headers });
  }
}
