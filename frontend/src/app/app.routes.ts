import { Routes } from '@angular/router';
import { sessionGuard } from './core/session/session.guard';

export const routes: Routes = [
  {
    path: 'join',
    title: 'Join · Huddle',
    loadComponent: () => import('./features/join/join-page').then((m) => m.JoinPage),
  },
  {
    path: 'rooms/:name',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'rooms/general' },
  { path: '**', redirectTo: 'rooms/general' },
];
