import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { DemoMode } from './core/mock/demo-mode';
import { MOCK_BOTS } from './core/mock/mock-hub';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MOCK_BOTS, useValue: false }],
    });
  });

  it('shows the demo banner only in demo mode', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.banner')).toBeNull();

    TestBed.inject(DemoMode).enable();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.banner')?.textContent).toContain('Demo mode');
  });
});
