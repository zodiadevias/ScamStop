import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements AfterViewInit, OnDestroy {
  private readonly mobileBreakpoint = '(max-width: 768px)';
  private readonly keyboardThreshold = 120;
  private readonly focusInHandler = (event: FocusEvent) => this.handleFocusIn(event);
  private readonly focusOutHandler = () => this.handleFocusOut();
  private readonly hashChangeHandler = () => this.setActiveLink();
  private readonly viewportResizeHandler = () => this.handleViewportResize();
  private initialViewportHeight = 0;

  ngAfterViewInit() {
    this.setActiveLink();
    window.addEventListener('hashchange', this.hashChangeHandler);
    document.addEventListener('focusin', this.focusInHandler);
    document.addEventListener('focusout', this.focusOutHandler);
    this.setupViewportTracking();
  }

  ngOnDestroy() {
    window.removeEventListener('hashchange', this.hashChangeHandler);
    document.removeEventListener('focusin', this.focusInHandler);
    document.removeEventListener('focusout', this.focusOutHandler);
    window.visualViewport?.removeEventListener('resize', this.viewportResizeHandler);
    window.visualViewport?.removeEventListener('scroll', this.viewportResizeHandler);
    document.body.classList.remove('keyboard-open');
    document.body.style.removeProperty('--keyboard-overlap');
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

  private handleFocusIn(event: FocusEvent) {
    if (!window.matchMedia(this.mobileBreakpoint).matches) return;

    const target = event.target as HTMLElement | null;
    if (this.isKeyboardTriggerElement(target)) {
      document.body.classList.add('keyboard-open');
    }
  }

  private handleFocusOut() {
    window.setTimeout(() => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!this.isKeyboardTriggerElement(activeElement)) {
        document.body.classList.remove('keyboard-open');
      }
    }, 0);
  }

  private isKeyboardTriggerElement(element: HTMLElement | null): boolean {
    if (!element) return false;
    const tagName = element.tagName;
    return (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  private setupViewportTracking() {
    if (!window.matchMedia(this.mobileBreakpoint).matches) return;
    if (!window.visualViewport) return;

    this.initialViewportHeight = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', this.viewportResizeHandler);
    window.visualViewport.addEventListener('scroll', this.viewportResizeHandler);
    this.handleViewportResize();
  }

  private handleViewportResize() {
    if (!window.visualViewport || !window.matchMedia(this.mobileBreakpoint).matches) return;

    const visualViewport = window.visualViewport;
    const currentHeight = visualViewport.height;
    if (!this.initialViewportHeight) {
      this.initialViewportHeight = currentHeight;
    }

    const heightDrop = this.initialViewportHeight - currentHeight;
    const overlapFromViewport = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
    const keyboardOverlap = Math.max(0, heightDrop, overlapFromViewport);
    const keyboardLikelyOpen = keyboardOverlap > this.keyboardThreshold;

    document.body.classList.toggle('keyboard-open', keyboardLikelyOpen);
    document.body.style.setProperty('--keyboard-overlap', `${keyboardLikelyOpen ? keyboardOverlap : 0}px`);
  }
}
