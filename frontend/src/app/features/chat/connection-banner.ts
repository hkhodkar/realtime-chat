import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ConnectionStatus } from '../../core/socket/room-connection';
import { Icon } from '../../shared/ui/icon';

/** Shows up while the room socket is down, with a live countdown to the next retry. */
@Component({
  selector: 'app-connection-banner',
  imports: [Icon],
  template: `
    @if (status() === 'reconnecting' || status() === 'closed') {
      <div class="banner" role="status">
        <app-icon name="wifiOff" [size]="18" />
        <span class="text">
          @if (status() === 'closed') {
            Disconnected from the chat.
          } @else if (seconds() > 0) {
            Connection lost. Reconnecting in {{ seconds() }}s…
          } @else {
            Reconnecting…
          }
        </span>
        @if (status() === 'reconnecting') {
          <button type="button" (click)="retry.emit()">
            <app-icon name="refresh" [size]="14" /> Retry now
          </button>
        }
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 20px 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: #fff4e5;
      border: 1px solid #f5d9a8;
      color: #7a4b00;
      font-size: 13.5px;
    }
    .text {
      flex: 1;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #e9c27e;
      border-radius: 6px;
      background: #fff;
      color: inherit;
      padding: 4px 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionBanner {
  readonly status = input.required<ConnectionStatus>();
  readonly retryAt = input<number | null>(null);
  readonly retry = output<void>();

  private readonly now = signal(Date.now());
  protected readonly seconds = computed(() => {
    const at = this.retryAt();
    return at ? Math.max(0, Math.ceil((at - this.now()) / 1000)) : 0;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 500);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
