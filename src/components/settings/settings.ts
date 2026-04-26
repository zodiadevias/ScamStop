import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  constructor(
    private router: Router,
    public themeService: ThemeService
  ) {}

  toggleLightMode(): void {
    this.themeService.toggleLightMode();
  }

  goToAbout(): void {
    this.router.navigateByUrl('/main/about');
  }
}
