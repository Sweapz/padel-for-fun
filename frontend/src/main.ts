import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { APP_SETTINGS, parseSettings } from './app/data/runtime-settings';

async function start(): Promise<void> {
  const response = await fetch(new URL('app-config.json', document.baseURI), {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Application settings are unavailable.');

  const settings = parseSettings(await response.json());
  await bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, { provide: APP_SETTINGS, useValue: settings }],
  });
}

start().catch(() => {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent =
    'The app could not start. Check the application settings and connection, then reload.';
  document.querySelector('app-root')?.replaceChildren(message);
});
