import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SessionDocument } from '../../../domain/session-workflow';

@Component({
  selector: 'app-session-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './session-list.html',
  styleUrl: './session-list.css',
})
export class SessionList {
  readonly documents = input.required<readonly SessionDocument[]>();

  playerNames(doc: SessionDocument): string {
    return doc.players.map((player) => player.name).join(', ');
  }
}
