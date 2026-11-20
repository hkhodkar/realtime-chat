import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MESSAGE_MAX_LENGTH, textLength } from '../../core/models/chat.models';
import { ConnectionStatus } from '../../core/socket/room-connection';
import { Icon } from '../../shared/ui/icon';

const EMOJI =
  '😀 😂 😊 😍 🤔 😅 😎 🥳 😢 😮 🙃 😴 👍 👎 👏 🙌 🙏 💪 👋 🤝 ❤️ 🔥 🎉 ✅ 🚀 💡 👀 💯 ☕ 🍕 🐛 ⚡'.split(
    ' ',
  );

@Component({
  selector: 'app-composer',
  imports: [Icon],
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
  host: {
    '(document:keydown.escape)': 'closePicker()',
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Composer {
  readonly roomName = input('');
  readonly status = input<ConnectionStatus>('open');

  readonly send = output<string>();
  readonly typing = output<void>();

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly pickerRoot = viewChild<ElementRef<HTMLElement>>('picker');

  protected readonly emoji = EMOJI;
  protected readonly max = MESSAGE_MAX_LENGTH;
  protected readonly text = signal('');
  protected readonly pickerOpen = signal(false);

  protected readonly length = computed(() => textLength(this.text().trim()));
  protected readonly tooLong = computed(() => this.length() > MESSAGE_MAX_LENGTH);
  protected readonly showCounter = computed(() => this.length() > MESSAGE_MAX_LENGTH - 200);
  protected readonly connected = computed(() => this.status() === 'open');
  protected readonly canSend = computed(
    () => this.connected() && this.length() > 0 && !this.tooLong(),
  );
  protected readonly placeholder = computed(() => {
    switch (this.status()) {
      case 'open':
        return `Message #${this.roomName()}`;
      case 'reconnecting':
        return 'Reconnecting… you can keep typing';
      case 'closed':
        return 'Disconnected';
      default:
        return 'Connecting…';
    }
  });

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.autosize();
    if (this.text().trim()) this.typing.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter sends, Shift+Enter adds a line; never send while an IME is composing
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    if (!this.canSend()) return;
    const body = this.text().trim();
    this.setText('');
    this.send.emit(body);
    this.focus();
  }

  /** Puts a message back when it could not be sent. */
  restore(body: string): void {
    if (!this.text().trim()) this.setText(body);
  }

  focus(): void {
    this.textarea().nativeElement.focus({ preventScroll: true });
  }

  protected togglePicker(): void {
    this.pickerOpen.update((open) => !open);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  protected onDocumentPointer(event: PointerEvent): void {
    const root = this.pickerRoot()?.nativeElement;
    if (this.pickerOpen() && root && !root.contains(event.target as Node)) this.closePicker();
  }

  protected insert(emoji: string): void {
    const el = this.textarea().nativeElement;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    this.setText(el.value.slice(0, start) + emoji + el.value.slice(end));
    el.focus();
    const caret = start + emoji.length;
    el.setSelectionRange(caret, caret);
    this.typing.emit();
  }

  private setText(value: string): void {
    this.text.set(value);
    this.textarea().nativeElement.value = value;
    this.autosize();
  }

  private autosize(): void {
    const el = this.textarea().nativeElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }
}
