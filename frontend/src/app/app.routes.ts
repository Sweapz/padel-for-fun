import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Your court · Padel Americano',
    loadComponent: () => import('./pages/home/home').then((page) => page.Home),
  },
  {
    path: 'session/new',
    title: 'Session setup · Padel Americano',
    loadComponent: () =>
      import('./pages/session-setup/session-setup').then((page) => page.SessionSetup),
  },
  {
    path: 'session/:id',
    title: 'Session · Padel Americano',
    loadComponent: () =>
      import('./pages/session-detail/session-detail').then((page) => page.SessionDetail),
  },
  {
    path: 'players',
    title: 'Players · Padel Americano',
    loadComponent: () => import('./pages/players/players').then((page) => page.Players),
  },
  {
    path: 'players/:id',
    title: 'Player · Padel Americano',
    loadComponent: () =>
      import('./pages/player-detail/player-detail').then((page) => page.PlayerDetail),
  },
  { path: '**', redirectTo: '' },
];
