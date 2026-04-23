import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UniversalModal } from './universal-modal';

describe('UniversalModal', () => {
  let component: UniversalModal;
  let fixture: ComponentFixture<UniversalModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UniversalModal],
    }).compileComponents();

    fixture = TestBed.createComponent(UniversalModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
