import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, startWith } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error';
import { RoomsStore } from '../../core/chat/rooms.store';
import { ROOM_NAME_PATTERN, Room } from '../../core/models/chat.models';
import { Icon } from '../../shared/ui/icon';

const DESCRIPTION_MAX = 140;

@Component({
  selector: 'app-create-room-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './create-room-dialog.html',
  styleUrl: './create-room-dialog.scss',
  host: { '(document:keydown.escape)': 'close()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateRoomDialog {
  private readonly rooms = inject(RoomsStore);

  readonly closed = output<void>();
  readonly created = output<Room>();

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private pressStartedOnBackdrop = false;

  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(30),
        Validators.pattern(ROOM_NAME_PATTERN),
      ],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(DESCRIPTION_MAX)],
    }),
  });

  private readonly description = toSignal(
    this.form.controls.description.valueChanges.pipe(startWith('')),
    { requireSync: true },
  );
  protected readonly descriptionLength = computed(() => this.description().trim().length);

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
  }

  protected nameError(): string | null {
    const control = this.form.controls.name;
    if (!control.errors || !control.touched) return null;
    if (control.hasError('required')) return 'Give the room a name';
    if (control.hasError('minlength')) return 'Use at least 2 characters';
    if (control.hasError('maxlength')) return 'Use at most 30 characters';
    if (control.hasError('pattern')) return 'Lowercase letters, numbers and single dashes only';
    if (control.hasError('taken')) return 'A room with this name already exists';
    return null;
  }

  protected descriptionError(): string | null {
    const control = this.form.controls.description;
    return control.hasError('maxlength') ? `Keep it under ${DESCRIPTION_MAX} characters` : null;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);
    const { name, description } = this.form.getRawValue();
    this.form.controls.name.setValue(name.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const room = await firstValueFrom(
        this.rooms.create({ name: name.trim(), description: description.trim() || null }),
      );
      this.created.emit(room);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.form.controls.name.setErrors({ taken: true });
        this.form.controls.name.markAsTouched();
      } else {
        this.error.set(apiErrorMessage(error, 'Could not create the room'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  // only a click that starts and ends on the backdrop closes the dialog
  protected backdropDown(event: MouseEvent): void {
    this.pressStartedOnBackdrop = event.target === event.currentTarget;
  }

  protected backdropClick(event: MouseEvent): void {
    if (this.pressStartedOnBackdrop && event.target === event.currentTarget) this.close();
    this.pressStartedOnBackdrop = false;
  }
}
