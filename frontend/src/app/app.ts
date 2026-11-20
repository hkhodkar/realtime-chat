import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoBanner } from './shared/ui/demo-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DemoBanner],
  template: `
    <app-demo-banner />
    <main class="page">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
    }
    .page {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
