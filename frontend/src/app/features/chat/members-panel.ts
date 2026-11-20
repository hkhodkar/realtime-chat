import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChatUser } from '../../core/models/chat.models';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-members-panel',
  imports: [Avatar, Icon],
  template: `
    <div class="head">
      <h2>
        Online <span class="count">{{ users().length }}</span>
      </h2>
      <button
        type="button"
        class="icon-btn close"
        aria-label="Close online list"
        (click)="closed.emit()"
      >
        <app-icon name="close" [size]="18" />
      </button>
    </div>
    <ul class="scroll">
      @for (user of users(); track user.username) {
        <li>
          <span class="avatar-wrap">
            <app-avatar [name]="user.username" [color]="user.color" [size]="32" />
            <i class="dot" aria-hidden="true"></i>
          </span>
          <span class="name">{{ user.username }}</span>
          @if (user.username === me()) {
            <span class="you">you</span>
          }
        </li>
      } @empty {
        <li class="empty">Nobody else is here yet</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      border-left: 1px solid var(--border);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 60px;
      padding: 0 12px 0 18px;
      border-bottom: 1px solid var(--border);
    }
    h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .count {
      margin-left: 4px;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text-muted);
      font-size: 12px;
    }
    .close {
      display: none;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 10px 8px;
      overflow-y: auto;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 14px;
    }
    li:hover {
      background: var(--surface);
    }
    .avatar-wrap {
      position: relative;
      display: inline-flex;
    }
    .dot {
      position: absolute;
      right: -2px;
      bottom: -2px;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: var(--success);
      border: 2px solid #fff;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .you {
      padding: 0 6px;
      border-radius: 4px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
    }
    .empty {
      color: var(--text-muted);
      font-size: 13px;
    }
    @media (max-width: 1180px) {
      .close {
        display: inline-grid;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersPanel {
  readonly users = input.required<ChatUser[]>();
  readonly me = input('');
  readonly closed = output<void>();
}
