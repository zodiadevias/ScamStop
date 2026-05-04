import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { FileUploader } from '../../services/file-uploader';
import { FirestoreService } from '../../services/firestore.service';
import { switchMap, of } from 'rxjs';

export const SCAM_TYPES = [
  'Online Selling Scam',
  'Investment Fraud',
  'Text Scam',
  'Love Scam',
  'Phishing',
  'Job Offer Scam',
  'Lottery / Prize Scam',
  'Tech Support Scam',
  'Identity Theft',
  'Child Predator',
  'Other',
] as const;

export type ScamType = (typeof SCAM_TYPES)[number];

export const PH_CITIES = [
  'Angeles City', 'Antipolo', 'Bacolod', 'Bago', 'Baguio', 'Batangas City',
  'Bayugan', 'Biñan', 'Bislig', 'Butuan', 'Cabanatuan', 'Cadiz', 'Cagayan de Oro',
  'Calamba', 'Calapan', 'Calbayog', 'Caloocan', 'Candon', 'Canlaon', 'Carcar',
  'Catbalogan', 'Cauayan', 'Cavite City', 'Cebu City', 'Cotabato City', 'Dagupan',
  'Danao', 'Dapitan', 'Davao City', 'Digos', 'Dipolog', 'Dumaguete', 'El Salvador',
  'Escalante', 'Gapan', 'General Santos', 'General Trias', 'Gingoog', 'Guihulngan',
  'Himamaylan', 'Ilagan', 'Iligan', 'Iloilo City', 'Imus', 'Iriga', 'Isabela City',
  'Kabankalan', 'Kidapawan', 'Koronadal', 'La Carlota', 'Lamitan', 'Laoag',
  'Lapu-Lapu City', 'Las Piñas', 'Legazpi', 'Ligao', 'Lipa', 'Lucena', 'Maasin',
  'Mabalacat', 'Makati', 'Malabon', 'Malaybalay', 'Malolos', 'Mandaluyong',
  'Mandaue', 'Manila', 'Marawi', 'Marikina', 'Masbate City', 'Mati', 'Meycauayan',
  'Muñoz', 'Muntinlupa', 'Naga (Camarines Sur)', 'Naga (Cebu)', 'Navotas',
  'Olongapo', 'Ormoc', 'Oroquieta', 'Ozamiz', 'Pagadian', 'Palayan', 'Panabo',
  'Parañaque', 'Pasay', 'Pasig', 'Passi', 'Puerto Princesa', 'Quezon City',
  'Roxas City', 'Sagay', 'Samal', 'San Carlos (Negros Occidental)',
  'San Carlos (Pangasinan)', 'San Fernando (La Union)', 'San Fernando (Pampanga)',
  'San Jose', 'San Jose del Monte', 'San Juan', 'San Pablo', 'Santa Rosa',
  'Santiago', 'Silay', 'Sipalay', 'Sorsogon City', 'Surigao City', 'Tabaco',
  'Tabuk', 'Tacloban', 'Tacurong', 'Tagaytay', 'Tagbilaran', 'Taguig',
  'Tagum', 'Talisay (Cebu)', 'Talisay (Negros Occidental)', 'Tanauan',
  'Tandag', 'Tangub', 'Tanjay', 'Tarlac City', 'Tayabas', 'Toledo',
  'Trece Martires', 'Tuguegarao', 'Urdaneta', 'Valencia', 'Valenzuela',
  'Victorias', 'Vigan', 'Zamboanga City',
].sort();

/** Static lat/lng for every city in PH_CITIES. Not shown in UI. */
export const PH_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Angeles City':                   { lat: 15.1450, lng: 120.5887 },
  'Antipolo':                       { lat: 14.5865, lng: 121.1760 },
  'Bacolod':                        { lat: 10.6765, lng: 122.9509 },
  'Bago':                           { lat: 10.5333, lng: 122.8333 },
  'Baguio':                         { lat: 16.4023, lng: 120.5960 },
  'Batangas City':                  { lat: 13.7565, lng: 121.0583 },
  'Bayugan':                        { lat:  8.7167, lng: 125.7500 },
  'Biñan':                          { lat: 14.3292, lng: 121.0800 },
  'Bislig':                         { lat:  8.2000, lng: 126.3167 },
  'Butuan':                         { lat:  8.9500, lng: 125.5333 },
  'Cabanatuan':                     { lat: 15.4833, lng: 120.9667 },
  'Cadiz':                          { lat: 10.9500, lng: 123.3000 },
  'Cagayan de Oro':                 { lat:  8.4542, lng: 124.6319 },
  'Calamba':                        { lat: 14.2117, lng: 121.1653 },
  'Calapan':                        { lat: 13.4119, lng: 121.1803 },
  'Calbayog':                       { lat: 12.0667, lng: 124.6000 },
  'Caloocan':                       { lat: 14.6500, lng: 120.9667 },
  'Candon':                         { lat: 17.1958, lng: 120.4486 },
  'Canlaon':                        { lat: 10.3833, lng: 123.2000 },
  'Carcar':                         { lat: 10.1000, lng: 123.6333 },
  'Catbalogan':                     { lat: 11.7750, lng: 124.8864 },
  'Cauayan':                        { lat: 16.9333, lng: 121.7667 },
  'Cavite City':                    { lat: 14.4791, lng: 120.8970 },
  'Cebu City':                      { lat: 10.3157, lng: 123.8854 },
  'Cotabato City':                  { lat:  7.2236, lng: 124.2461 },
  'Dagupan':                        { lat: 16.0430, lng: 120.3330 },
  'Danao':                          { lat: 10.5167, lng: 124.0167 },
  'Dapitan':                        { lat:  8.6500, lng: 123.4167 },
  'Davao City':                     { lat:  7.0731, lng: 125.6128 },
  'Digos':                          { lat:  6.7500, lng: 125.3500 },
  'Dipolog':                        { lat:  8.5833, lng: 123.3333 },
  'Dumaguete':                      { lat:  9.3103, lng: 123.3081 },
  'El Salvador':                    { lat:  8.5667, lng: 124.5167 },
  'Escalante':                      { lat: 10.8333, lng: 123.5000 },
  'Gapan':                          { lat: 15.3083, lng: 120.9458 },
  'General Santos':                 { lat:  6.1128, lng: 125.1717 },
  'General Trias':                  { lat: 14.3833, lng: 120.8833 },
  'Gingoog':                        { lat:  8.8167, lng: 125.1000 },
  'Guihulngan':                     { lat: 10.1167, lng: 123.2667 },
  'Himamaylan':                     { lat: 10.1000, lng: 122.8667 },
  'Ilagan':                         { lat: 17.1500, lng: 121.8833 },
  'Iligan':                         { lat:  8.2280, lng: 124.2452 },
  'Iloilo City':                    { lat: 10.6969, lng: 122.5644 },
  'Imus':                           { lat: 14.4297, lng: 120.9367 },
  'Iriga':                          { lat: 13.4167, lng: 123.4167 },
  'Isabela City':                   { lat:  6.7000, lng: 121.9667 },
  'Kabankalan':                     { lat:  9.9833, lng: 122.8167 },
  'Kidapawan':                      { lat:  7.0083, lng: 125.0894 },
  'Koronadal':                      { lat:  6.5028, lng: 124.8469 },
  'La Carlota':                     { lat: 10.4167, lng: 122.9167 },
  'Lamitan':                        { lat:  6.6500, lng: 122.1333 },
  'Laoag':                          { lat: 18.1980, lng: 120.5936 },
  'Lapu-Lapu City':                 { lat: 10.3103, lng: 123.9494 },
  'Las Piñas':                      { lat: 14.4500, lng: 120.9833 },
  'Legazpi':                        { lat: 13.1391, lng: 123.7438 },
  'Ligao':                          { lat: 13.2167, lng: 123.5167 },
  'Lipa':                           { lat: 13.9411, lng: 121.1631 },
  'Lucena':                         { lat: 13.9333, lng: 121.6167 },
  'Maasin':                         { lat: 10.1333, lng: 124.8500 },
  'Mabalacat':                      { lat: 15.2167, lng: 120.5833 },
  'Makati':                         { lat: 14.5547, lng: 121.0244 },
  'Malabon':                        { lat: 14.6625, lng: 120.9572 },
  'Malaybalay':                     { lat:  8.1575, lng: 125.1278 },
  'Malolos':                        { lat: 14.8433, lng: 120.8114 },
  'Mandaluyong':                    { lat: 14.5794, lng: 121.0359 },
  'Mandaue':                        { lat: 10.3236, lng: 123.9223 },
  'Manila':                         { lat: 14.5995, lng: 120.9842 },
  'Marawi':                         { lat:  7.9986, lng: 124.2928 },
  'Marikina':                       { lat: 14.6507, lng: 121.1029 },
  'Masbate City':                   { lat: 12.3667, lng: 123.6167 },
  'Mati':                           { lat:  6.9500, lng: 126.2167 },
  'Meycauayan':                     { lat: 14.7333, lng: 120.9667 },
  'Muñoz':                          { lat: 15.7167, lng: 120.9000 },
  'Muntinlupa':                     { lat: 14.4081, lng: 121.0415 },
  'Naga (Camarines Sur)':           { lat: 13.6192, lng: 123.1814 },
  'Naga (Cebu)':                    { lat: 10.2167, lng: 123.7500 },
  'Navotas':                        { lat: 14.6667, lng: 120.9500 },
  'Olongapo':                       { lat: 14.8292, lng: 120.2828 },
  'Ormoc':                          { lat: 11.0064, lng: 124.6075 },
  'Oroquieta':                      { lat:  8.4833, lng: 123.8000 },
  'Ozamiz':                         { lat:  8.1500, lng: 123.8500 },
  'Pagadian':                       { lat:  7.8278, lng: 123.4378 },
  'Palayan':                        { lat: 15.5500, lng: 121.0833 },
  'Panabo':                         { lat:  7.3000, lng: 125.6833 },
  'Parañaque':                      { lat: 14.4793, lng: 121.0198 },
  'Pasay':                          { lat: 14.5378, lng: 121.0014 },
  'Pasig':                          { lat: 14.5764, lng: 121.0851 },
  'Passi':                          { lat: 11.1000, lng: 122.6333 },
  'Puerto Princesa':                { lat:  9.7392, lng: 118.7353 },
  'Quezon City':                    { lat: 14.6760, lng: 121.0437 },
  'Roxas City':                     { lat: 11.5833, lng: 122.7500 },
  'Sagay':                          { lat: 10.9000, lng: 123.4167 },
  'Samal':                          { lat:  7.0833, lng: 125.7167 },
  'San Carlos (Negros Occidental)': { lat: 10.4833, lng: 123.4167 },
  'San Carlos (Pangasinan)':        { lat: 15.9167, lng: 120.3500 },
  'San Fernando (La Union)':        { lat: 16.6159, lng: 120.3164 },
  'San Fernando (Pampanga)':        { lat: 15.0289, lng: 120.6899 },
  'San Jose':                       { lat: 12.3500, lng: 121.0667 },
  'San Jose del Monte':             { lat: 14.8167, lng: 121.0500 },
  'San Juan':                       { lat: 14.6000, lng: 121.0333 },
  'San Pablo':                      { lat: 14.0667, lng: 121.3167 },
  'Santa Rosa':                     { lat: 14.3122, lng: 121.1114 },
  'Santiago':                       { lat: 16.6833, lng: 121.5500 },
  'Silay':                          { lat: 10.8000, lng: 122.9667 },
  'Sipalay':                        { lat:  9.7500, lng: 122.4000 },
  'Sorsogon City':                  { lat: 12.9742, lng: 124.0050 },
  'Surigao City':                   { lat:  9.7833, lng: 125.4833 },
  'Tabaco':                         { lat: 13.3583, lng: 123.7333 },
  'Tabuk':                          { lat: 17.4167, lng: 121.4333 },
  'Tacloban':                       { lat: 11.2442, lng: 125.0039 },
  'Tacurong':                       { lat:  6.6833, lng: 124.6833 },
  'Tagaytay':                       { lat: 14.1000, lng: 120.9333 },
  'Tagbilaran':                     { lat:  9.6500, lng: 123.8500 },
  'Taguig':                         { lat: 14.5243, lng: 121.0792 },
  'Tagum':                          { lat:  7.4478, lng: 125.8078 },
  'Talisay (Cebu)':                 { lat: 10.2444, lng: 123.8483 },
  'Talisay (Negros Occidental)':    { lat: 10.7333, lng: 122.9667 },
  'Tanauan':                        { lat: 14.0861, lng: 121.1500 },
  'Tandag':                         { lat:  9.0667, lng: 126.1833 },
  'Tangub':                         { lat:  8.0667, lng: 123.7500 },
  'Tanjay':                         { lat:  9.5167, lng: 123.1500 },
  'Tarlac City':                    { lat: 15.4833, lng: 120.5833 },
  'Tayabas':                        { lat: 14.0167, lng: 121.5833 },
  'Toledo':                         { lat: 10.3833, lng: 123.6333 },
  'Trece Martires':                 { lat: 14.2833, lng: 120.8667 },
  'Tuguegarao':                     { lat: 17.6131, lng: 121.7269 },
  'Urdaneta':                       { lat: 15.9833, lng: 120.5667 },
  'Valencia':                       { lat:  7.9000, lng: 125.0833 },
  'Valenzuela':                     { lat: 14.7000, lng: 120.9833 },
  'Victorias':                      { lat: 10.9000, lng: 123.0833 },
  'Vigan':                          { lat: 17.5747, lng: 120.3869 },
  'Zamboanga City':                 { lat:  6.9214, lng: 122.0790 },
};

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report.html',
  styleUrl: './report.css',
})
export class Report implements OnInit {
  readonly scamTypes = SCAM_TYPES;
  readonly phCities  = PH_CITIES;

  // ── Victim fields ──────────────────────────────────────────────────────────
  victimName = signal('');
  scamType   = signal<ScamType | ''>('');
  reportText = signal('');
  urlInput   = signal('');

  // ── Suspect fields ─────────────────────────────────────────────────────────
  suspectName    = signal('');
  suspectContact = signal('');
  amountLost     = signal<number | ''>('');

  // ── Location ───────────────────────────────────────────────────────────────
  city            = signal('');
  locationLoading = signal(false);
  locationError   = signal('');
  /** Hidden — never shown in UI, sent to Firestore only */
  private coords  = signal<{ lat: number; lng: number } | null>(null);

  onCityChange(value: string): void {
    this.city.set(value);
    this.coords.set(PH_CITY_COORDS[value] ?? null);
  }

  // ── File upload ────────────────────────────────────────────────────────────
  selectedFile    = signal<File | null>(null);
  uploadedFileUrl = signal<string | null>(null);
  uploading       = signal(false);
  uploadError     = signal('');

  // ── Submission state ───────────────────────────────────────────────────────
  submitting     = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  reportStatus   = signal<'pending' | 'verified' | 'rejected' | null>(null);
  reportId       = signal<string | null>(null);

  // ── Status lookup ──────────────────────────────────────────────────────────
  lookupId      = signal('');
  lookupLoading = signal(false);
  lookupError   = signal('');
  lookupResult  = signal<{
    report_id: string;
    status: 'pending' | 'verified' | 'rejected';
    scam_type: string;
    victim_name: string;
    reported_at: string | null;
    admin_reply?: string | null;
    replied_at?: string | null;
  } | null>(null);

  constructor(
    private firestoreService: FirestoreService,
    private fileUploader: FileUploader,
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const message = this.route.snapshot.queryParamMap.get('message');
    if (message) this.reportText.set(message);
    this.detectLocation();
  }

  // ── Location detection ─────────────────────────────────────────────────────

  private get chrome(): any {
    return typeof window !== 'undefined' ? (window as any).chrome : undefined;
  }

  private isExtensionContext(): boolean {
    return !!this.chrome?.runtime?.sendMessage;
  }

  detectLocation(): void {
    this.locationLoading.set(true);
    this.locationError.set('');

    if (this.isExtensionContext()) {
      // Extensions can't use navigator.geolocation in the popup.
      // ip-api.com works without an API key and allows extension requests.
      this.http.get<any>('http://ip-api.com/json/?fields=city,regionName').subscribe({
        next: (res) => {
          const city = res?.city || res?.regionName || '';
          this.city.set(city);
          this.coords.set(PH_CITY_COORDS[city] ?? null);
          this.locationLoading.set(false);
        },
        error: () => {
          // Silent fallback — user can select manually
          this.locationLoading.set(false);
        },
      });
      return;
    }

    // Web context — use precise geolocation with Nominatim reverse-geocode
    if (!navigator.geolocation) {
      this.locationError.set('Geolocation not supported. Please type your city manually.');
      this.locationLoading.set(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.http
          .get<any>(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          )
          .subscribe({
            next: (res) => {
              const addr = res?.address ?? {};
              const city =
                addr.city ||
                addr.town ||
                addr.municipality ||
                addr.county ||
                addr.state_district ||
                addr.state ||
                '';
              this.city.set(city);
              this.coords.set(PH_CITY_COORDS[city] ?? null);
              this.locationLoading.set(false);
            },
            error: () => {
              this.locationError.set('Could not resolve city name. Please type it manually.');
              this.locationLoading.set(false);
            },
          });
      },
      () => {
        this.locationError.set('Location access denied. Please type your city manually.');
        this.locationLoading.set(false);
      },
      { timeout: 8000 }
    );
  }

  // ── Status lookup ──────────────────────────────────────────────────────────

  checkStatus(): void {
    const id = this.lookupId().trim();
    if (!id) { this.lookupError.set('Please enter a report ID.'); return; }

    this.lookupLoading.set(true);
    this.lookupError.set('');
    this.lookupResult.set(null);

    this.firestoreService.getReportStatus(id).subscribe({
      next: (res) => { this.lookupResult.set(res); this.lookupLoading.set(false); },
      error: (err) => {
        this.lookupError.set(
          err?.status === 404
            ? 'No report found with that ID.'
            : 'Could not retrieve report. Please try again.'
        );
        this.lookupLoading.set(false);
      },
    });
  }

  // ── File handling ──────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
    this.uploadedFileUrl.set(null);
    this.uploadError.set('');
  }

  removeFile(): void {
    this.selectedFile.set(null);
    this.uploadedFileUrl.set(null);
    this.uploadError.set('');
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  submitReport(): void {
    const message = this.reportText().trim();
    const name    = this.victimName().trim();
    const type    = this.scamType();

    if (!name)    { this.errorMessage.set("Please enter the victim's name."); return; }
    if (!type)    { this.errorMessage.set('Please select a scam type.'); return; }
    if (!message) { this.errorMessage.set('Please describe the scam.'); return; }

    this.submitting.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    const file    = this.selectedFile();
    const upload$ = file ? this.fileUploader.uploadFile(file) : of(null);

    upload$.pipe(
      switchMap((uploadRes: any) => {
        const fileUrl = uploadRes?.file
          ? `https://dy4jlo0hs3.ucarecd.net/${uploadRes.file}/`
          : null;

        if (fileUrl) this.uploadedFileUrl.set(fileUrl);

        return this.firestoreService.submitReport({
          message,
          victim_name:     name,
          scam_type:       type,
          url:             this.urlInput().trim() || null,
          evidence_url:    fileUrl,
          city:            this.city().trim() || null,
          latitude:        this.coords()?.lat ?? null,
          longitude:       this.coords()?.lng ?? null,
          suspect_name:    this.suspectName().trim()    || null,
          suspect_contact: this.suspectContact().trim() || null,
          amount_lost:     this.amountLost() != null && this.amountLost() !== ''
                             ? String(this.amountLost()) : null,
        });
      })
    ).subscribe({
      next: (res: any) => {
        this.reportStatus.set(res?.report_status ?? 'pending');
        this.reportId.set(res?.report_id ?? null);
        this.successMessage.set('Thank you! Your report has been submitted successfully.');
        // Reset form
        this.victimName.set('');
        this.scamType.set('');
        this.reportText.set('');
        this.urlInput.set('');
        this.suspectName.set('');
        this.suspectContact.set('');
        this.amountLost.set('');
        this.selectedFile.set(null);
        this.uploadedFileUrl.set(null);
        this.submitting.set(false);
      },
      error: (err: any) => {
        const detail = err?.message || err?.error || '';
        this.errorMessage.set(
          detail
            ? `Unable to submit report: ${detail}`
            : 'Unable to submit your report right now. Please try again later.'
        );
        this.submitting.set(false);
      },
    });
  }
}
