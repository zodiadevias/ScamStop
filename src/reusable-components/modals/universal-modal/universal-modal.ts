import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ModalContentType = 'terms' | 'privacy' | 'about' | 'help' | 'custom';

@Component({
  selector: 'app-universal-modal',
  imports: [CommonModule],
  templateUrl: './universal-modal.html',
  styleUrl: './universal-modal.css',
})
export class UniversalModal {
  @Input() title = 'Modal';
  @Input() contentType: ModalContentType = 'custom';
  @Input() customContent: string = '';
  @Input() showAcceptButton = true;
  @Input() acceptButtonText = 'Accept';

  @Output() close = new EventEmitter<void>();
  @Output() accept = new EventEmitter<void>();

  closeModal() {
    this.close.emit();
  }

  acceptTerms() {
    this.accept.emit();
  }
}
