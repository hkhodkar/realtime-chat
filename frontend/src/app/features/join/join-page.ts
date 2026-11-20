import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, map, of, startWith, switchMap, timer } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error';
import { ChatApi } from '../../core/api/chat-api';
import { AVATAR_COLORS, USERNAME_PATTERN } from '../../core/models/chat.models';
import { SessionStore } from '../../core/session/session.store';
import { Avatar } from '../../shared/ui/avatar';

function availableUsername(api: ChatApi): AsyncValidatorFn {
  return (control: AbstractControl<string>): Observable<ValidationErrors | null> =>
    timer(350).pipe(
      switchMap(() => api.availability(control.value.trim())),
      map((result) => (result.available ? null : { taken: true })),
      // the server checks again on submit
      catchError(() => of(null)),
    );
}

@Component({
  selector: 'app-join-page',
  imports: [ReactiveFormsModule, Avatar],
  templateUrl: './join-page.html',
  styleUrl: './join-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinPage {
  private readonly api = inject(ChatApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  readonly reason = input<string>();
  readonly redirect = input<string>();

  protected readonly colors = AVATAR_COLORS;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    username: new FormControl(this.session.lastUser()?.username ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(20),
        Validators.pattern(USERNAME_PATTERN),
      ],
      asyncValidators: availableUsername(this.api),
    }),
    color: new FormControl<string>(this.session.lastUser()?.color ?? AVATAR_COLORS[5], {
      nonNullable: true,
    }),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { requireSync: true },
  );
  private readonly usernameStatus = toSignal(
    this.form.controls.username.statusChanges.pipe(startWith(this.form.controls.username.status)),
    { requireSync: true },
  );

  protected readonly previewName = computed(() => this.value().username?.trim() || 'You');
  protected readonly previewColor = computed(() => this.value().color ?? AVATAR_COLORS[5]);
  protected readonly checking = computed(() => this.usernameStatus() === 'PENDING');
  protected readonly available = computed(
    () => this.usernameStatus() === 'VALID' && !!this.value().username?.trim(),
  );

  protected usernameError(): string | null {
    const control = this.form.controls.username;
    if (!control.errors || !(control.touched || control.dirty)) return null;
    if (control.hasError('required')) return 'Pick a username to join';
    if (control.hasError('minlength')) return 'Use at least 2 characters';
    if (control.hasError('maxlength')) return 'Use at most 20 characters';
    if (control.hasError('pattern'))
      return 'Start with a letter or number, then letters, numbers, . _ or -';
    if (control.hasError('taken')) return 'Someone online is already using this name';
    return null;
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set(null);
    const control = this.form.controls.username;
    control.setValue(control.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    try {
      const session = await firstValueFrom(this.api.createSession(this.form.getRawValue()));
      this.session.save(session);
      const target = this.redirect()?.startsWith('/rooms/') ? this.redirect()! : '/rooms/general';
      await this.router.navigateByUrl(target);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        control.setErrors({ taken: true });
        control.markAsTouched();
      } else {
        this.error.set(apiErrorMessage(error, 'Could not join right now, please try again'));
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
