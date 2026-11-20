import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  host: {
    class: 'avatar',
    '[style.background]': 'color()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.42',
    '[attr.aria-hidden]': 'true',
  },
  template: `{{ initials() }}`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      border-radius: 10px;
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.02em;
      user-select: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly color = input('#64748b');
  readonly size = input(36);

  protected readonly initials = computed(() => {
    const parts = this.name()
      .split(/[\s._-]+/)
      .filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : this.name().slice(0, 2);
    return letters.toUpperCase();
  });
}
