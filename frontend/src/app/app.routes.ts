import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Your court · Padel Americano',
    loadComponent: () => import('./pages/home').then((page) => page.Home),
  },
  {
    path: 'session/new',
    title: 'Session setup · Padel Americano',
    loadComponent: () => import('./pages/session-setup').then((page) => page.SessionSetup),
  },
  { path: '**', redirectTo: '' },
];
