import { Component, HostBinding, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('ScamStop');

  @HostBinding('class.light-mode')
  isLightMode = false;

  constructor(public themeService: ThemeService) {
    this.themeService.initializeTheme();

    // effect() reacts to signal changes and updates the HostBinding property,
    // which triggers Angular CD to re-evaluate the class binding.
    effect(() => {
      this.isLightMode = this.themeService.lightModeEnabled();
    });
  }
}
