import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-session-setup',
  imports: [RouterLink],
  template: `
    <section class="panel setup" aria-labelledby="setup-title">
      <p class="eyebrow">Coming next</p>
      <h1 id="setup-title">Bring your group.</h1>
      <p class="lead">
        Session setup will let you choose five or six players for one court. There will be no fixed
        number of matches.
      </p>
      <p>
        Player selection and session creation are not implemented yet. This local development
        preview does not save or share data.
      </p>
      <a class="button" routerLink="/">Back to your court</a>
    </section>
  `,
})
export class SessionSetup {}
