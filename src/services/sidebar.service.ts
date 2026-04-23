import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  isCollapsed = signal(true);

  toggle() {
    this.isCollapsed.update(v => !v);
  }
}