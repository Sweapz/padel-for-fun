import { Routes } from '@angular/router';
import { requireSignIn, showLogin } from './auth/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Padel Americano',
    canActivate: [showLogin],
    loadComponent: () => import('./pages/login/login').then((p) => p.Login),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [requireSignIn],
    title: 'Your court · Padel Americano',
    loadComponent: () => import('./pages/home/home').then((page) => page.Home),
  },
  {
    path: 'session/new',
    canActivate: [requireSignIn],
    title: 'Session setup · Padel Americano',
    loadComponent: () =>
      import('./pages/session-setup/session-setup').then((page) => page.SessionSetup),
  },
  {
    path: 'session/:id',
    canActivate: [requireSignIn],
    title: 'Session · Padel Americano',
    loadComponent: () =>
      import('./pages/session-detail/session-detail').then((page) => page.SessionDetail),
  },
  {
    path: 'players',
    canActivate: [requireSignIn],
    title: 'Players · Padel Americano',
    loadComponent: () => import('./pages/players/players').then((page) => page.Players),
  },
  {
    path: 'players/:id',
    canActivate: [requireSignIn],
    title: 'Player · Padel Americano',
    loadComponent: () =>
      import('./pages/player-detail/player-detail').then((page) => page.PlayerDetail),
  },
  { path: '**', redirectTo: '' },
];
