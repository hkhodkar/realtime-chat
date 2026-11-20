import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DemoMode } from '../../core/mock/demo-mode';
import { MockHub } from '../../core/mock/mock-hub';

@Component({
  selector: 'app-demo-banner',
  template: `
    @if (demo.active()) {
      <div class="banner" role="status">
        <span class="badge">Demo</span>
        <span class="text">
          Demo mode – sample data stored in your browser.
          <span class="hint">Open a second tab to chat with yourself.</span>
        </span>
        <button type="button" (click)="reset()">Reset data</button>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 34px;
      padding: 4px 16px;
      background: #fff7e6;
      border-bottom: 1px solid #f3dfb2;
      color: #6b4e16;
      font-size: 13px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      background: #f6c453;
      color: #4a3407;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    button {
      border: 1px solid #e7c873;
      background: #fff;
      color: #6b4e16;
      border-radius: 6px;
      padding: 4px 10px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover {
      background: #fdf1d4;
    }
    @media (max-width: 640px) {
      .hint {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoBanner {
  protected readonly demo = inject(DemoMode);
  private readonly hub = inject(MockHub);

  protected reset(): void {
    this.hub.reset();
  }
}
