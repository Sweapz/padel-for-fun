import { Component, inject } from '@angular/core';
import { SessionStore } from '../../data/session-store';

@Component({
  selector: 'app-session-feedback',
  templateUrl: './session-feedback.html',
  styleUrl: './session-feedback.css',
})
export class SessionFeedback {
  readonly store = inject(SessionStore);
}
