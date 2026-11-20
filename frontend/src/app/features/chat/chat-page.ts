import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { RoomStore } from '../../core/chat/room.store';
import { RoomsStore } from '../../core/chat/rooms.store';
import { Room } from '../../core/models/chat.models';
import { DemoMode } from '../../core/mock/demo-mode';
import { SessionStore } from '../../core/session/session.store';
import { Icon } from '../../shared/ui/icon';
import { Composer } from './composer';
import { ConnectionBanner } from './connection-banner';
import { CreateRoomDialog } from './create-room-dialog';
import { MembersPanel } from './members-panel';
import { MessageList } from './message-list';
import { RoomSidebar } from './room-sidebar';

@Component({
  selector: 'app-chat-page',
  imports: [
    RouterLink,
    Icon,
    RoomSidebar,
    MessageList,
    Composer,
    MembersPanel,
    CreateRoomDialog,
    ConnectionBanner,
  ],
  providers: [RoomStore],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPage {
  protected readonly rooms = inject(RoomsStore);
  protected readonly room = inject(RoomStore);
  private readonly session = inject(SessionStore);
  private readonly demo = inject(DemoMode);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  /** Room name from the URL. */
  readonly name = input.required<string>();

  private readonly composer = viewChild(Composer);

  protected readonly user = computed(
    () => this.session.user() ?? { username: '', color: '#64748b' },
  );
  protected readonly current = computed(() => this.rooms.byName(this.name()) ?? null);
  protected readonly notFound = computed(
    () => this.rooms.loaded() && !this.rooms.loading() && !this.current(),
  );
  protected readonly drawerOpen = signal(false);
  protected readonly membersOpen = signal(false);
  protected readonly creating = signal(false);

  constructor() {
    void this.rooms.load();

    effect(() => {
      const room = this.current();
      this.rooms.activeRoomId.set(room?.id ?? null);
      if (room) untracked(() => this.room.open(room.id));
    });

    effect(() => {
      const room = this.current();
      this.rooms.markRead(room?.id ?? null);
      const unread = this.rooms.totalUnread();
      const prefix = unread ? `(${unread}) ` : '';
      this.title.setTitle(`${prefix}${room ? '#' + room.name : 'Rooms'} · Huddle`);
    });

    // the demo data was reset (here or in another tab): start over
    let revision = this.demo.revision();
    effect(() => {
      const next = this.demo.revision();
      if (next === revision) return;
      revision = next;
      untracked(() => {
        void this.rooms.load(true).then(() => this.room.reload());
      });
    });

    inject(DestroyRef).onDestroy(() => this.rooms.activeRoomId.set(null));
  }

  protected send(body: string): void {
    if (!this.room.send(body)) {
      this.composer()?.restore(body);
      this.room.notice.set('Not connected right now, your message was not sent.');
    }
  }

  protected roomCreated(room: Room): void {
    this.creating.set(false);
    void this.router.navigate(['/rooms', room.name]);
  }

  protected openCreate(): void {
    this.drawerOpen.set(false);
    this.creating.set(true);
  }

  protected async switchUser(): Promise<void> {
    this.room.stopTyping();
    await this.router.navigate(['/join']);
    await this.session.leave();
  }
}
