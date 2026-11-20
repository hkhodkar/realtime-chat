import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TimelineBlock } from '../../core/chat/timeline';
import { Message } from '../../core/models/chat.models';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';
import { isJumboEmoji, linkify } from '../../shared/utils/linkify';
import { clockTime, fullTime } from '../../shared/utils/time';

/** Distance from the bottom (px) that still counts as "reading the latest". */
const STICKY_THRESHOLD = 80;
/** Start loading older messages this close to the top. */
const LOAD_THRESHOLD = 150;

@Component({
  selector: 'app-message-list',
  imports: [Avatar, Icon],
  templateUrl: './message-list.html',
  styleUrl: './message-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageList {
  private readonly injector = inject(Injector);

  readonly blocks = input.required<TimelineBlock[]>();
  readonly messages = input.required<Message[]>();
  readonly roomId = input.required<number>();
  readonly me = input.required<string>();
  readonly hasMore = input(false);
  readonly loading = input(false);
  readonly loadingOlder = input(false);

  readonly loadOlder = output<void>();

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  protected readonly unseen = signal(0);

  private atBottom = true;
  private anchor: number | null = null;
  private seen = { roomId: -1, first: 0, last: 0, count: 0 };

  protected readonly clock = clockTime;
  protected readonly fullTime = fullTime;
  protected readonly linkify = linkify;
  protected readonly jumbo = isJumboEmoji;

  constructor() {
    // keep the scroll position sensible whenever messages are added on either end
    effect(() => {
      const messages = this.messages();
      const roomId = this.roomId();
      this.blocks();
      untracked(() => this.afterChange(roomId, messages));
    });
  }

  protected onScroll(): void {
    const el = this.viewport().nativeElement;
    this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD;
    if (this.atBottom) this.unseen.set(0);
    if (el.scrollTop < LOAD_THRESHOLD) this.requestOlder();
  }

  protected requestOlder(): void {
    if (!this.hasMore() || this.loadingOlder() || this.loading()) return;
    const el = this.viewport().nativeElement;
    this.anchor = el.scrollHeight - el.scrollTop;
    this.loadOlder.emit();
  }

  protected jumpToLatest(): void {
    this.unseen.set(0);
    this.scrollToBottom(true);
  }

  private afterChange(roomId: number, messages: Message[]): void {
    const first = messages[0]?.id ?? 0;
    const last = messages.at(-1)?.id ?? 0;
    const previous = this.seen;
    this.seen = { roomId, first, last, count: messages.length };

    let action: 'bottom' | 'anchor' | 'follow' | 'none' = 'none';
    if (roomId !== previous.roomId || (previous.count === 0 && messages.length)) {
      this.unseen.set(0);
      this.atBottom = true;
      action = 'bottom';
    } else if (first < previous.first && this.anchor !== null) {
      action = 'anchor';
    } else if (last > previous.last) {
      const mine = messages.at(-1)?.author === this.me();
      if (this.atBottom || mine) {
        action = 'bottom';
      } else {
        const added = messages.filter((message) => message.id > previous.last).length;
        this.unseen.update((count) => count + added);
      }
    } else if (this.atBottom) {
      action = 'follow';
    }

    afterNextRender(
      {
        write: () => {
          const el = this.viewport().nativeElement;
          if (action === 'anchor' && this.anchor !== null) {
            el.scrollTop = el.scrollHeight - this.anchor;
            this.anchor = null;
          } else if (action === 'bottom' || action === 'follow') {
            this.scrollToBottom(false);
          }
        },
      },
      { injector: this.injector },
    );
  }

  private scrollToBottom(smooth: boolean): void {
    const el = this.viewport().nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    this.atBottom = true;
  }
}
