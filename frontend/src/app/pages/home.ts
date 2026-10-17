import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="hero" aria-labelledby="home-title">
      <div>
        <p class="eyebrow">One court. Your people.</p>
        <h1 id="home-title">Keep the game<br />going.</h1>
        <p class="lead">
          A place for your group's Americano sessions. Rotate partners, share the court, and play
          until you're ready to stop.
        </p>
        <a class="button" routerLink="/session/new"
          >Explore session setup <span aria-hidden="true">↗</span></a
        >
      </div>
      <div class="court" role="img" aria-label="Illustration of a doubles padel court">
        <span class="court-net"></span>
        <span class="player player-one"></span><span class="player player-two"></span>
        <span class="player player-three"></span><span class="player player-four"></span>
        <span class="court-ball"></span>
      </div>
    </section>
    <section class="facts" aria-label="The format">
      <div><strong>5–6</strong><span>players in your group</span></div>
      <div><strong>16</strong><span>combined points per match</span></div>
      <div><strong>Open-ended</strong><span>finish when you choose</span></div>
    </section>
    <section class="panel" aria-labelledby="session-title">
      <p class="eyebrow">Your next session</p>
      <h2 id="session-title">A fresh court awaits.</h2>
      <p>
        This is the app foundation. Player selection, fair match rotation, score entry, and
        standings are coming next.
      </p>
      <p class="note">No sessions are created or saved in this preview.</p>
    </section>
  `,
})
export class Home {}
