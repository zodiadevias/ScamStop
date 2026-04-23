import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements AfterViewInit {
  ngAfterViewInit() {
    this.setActiveLink();
    window.addEventListener('hashchange', () => this.setActiveLink());
  }

  setActiveLink() {
    const currentHash = window.location.hash.slice(1) || '/main/home';
    const links = document.querySelectorAll('.nav-item');
    links.forEach((link: any) => {
      const href = link.getAttribute('href').slice(1);
      if (href === currentHash || (currentHash === '/main' && href === '/main/home')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
}
