import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ChatUser, Room } from '../../core/models/chat.models';
import { ConnectionStatus } from '../../core/socket/room-connection';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';
import { shortTime } from '../../shared/utils/time';

@Component({
  selector: 'app-room-sidebar',
  imports: [RouterLink, RouterLinkActive, Avatar, Icon],
  templateUrl: './room-sidebar.html',
  styleUrl: './room-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomSidebar {
  readonly rooms = input.required<Room[]>();
  readonly unread = input.required<Record<number, number>>();
  readonly activeId = input<number | null>(null);
  readonly user = input.required<ChatUser>();
  readonly status = input<ConnectionStatus>('connecting');
  readonly loading = input(false);

  readonly createRoom = output<void>();
  readonly selected = output<void>();
  readonly switchUser = output<void>();
  readonly closeDrawer = output<void>();

  protected readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'open':
        return 'Online';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'closed':
        return 'Offline';
      default:
        return 'Connecting…';
    }
  });

  protected preview(room: Room): string {
    const last = room.last_message;
    if (!last) return room.description ?? 'No messages yet';
    const author = last.author === this.user().username ? 'You' : last.author;
    return `${author}: ${last.body.replace(/\s+/g, ' ')}`;
  }

  protected time(room: Room): string {
    return room.last_message ? shortTime(room.last_message.created_at) : '';
  }
}
