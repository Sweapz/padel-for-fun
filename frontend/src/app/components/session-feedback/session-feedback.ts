import { Component, inject } from '@angular/core';
import { SessionStore } from '../../data/session-store';
import { APP_SETTINGS } from '../../data/runtime-settings';

@Component({
  selector: 'app-session-feedback',
  templateUrl: './session-feedback.html',
  styleUrl: './session-feedback.css',
})
export class SessionFeedback {
  readonly store = inject(SessionStore);
  readonly shared = inject(APP_SETTINGS).mode === 'supabase';
}
