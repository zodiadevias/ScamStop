import { Component } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../reusable-components/components/sidebar/sidebar';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-main',
  imports: [CommonModule, RouterOutlet, Sidebar],
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class Main {
  animate = false;

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.animate = false;
      setTimeout(() => this.animate = true, 10);
    });
  }
}
