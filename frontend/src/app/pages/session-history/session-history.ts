import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { previousSessions } from '../../../domain/clubhouse';
import { SessionList } from '../../components/session-list/session-list';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { SessionStore } from '../../data/session-store';

@Component({
  selector: 'app-session-history',
  imports: [RouterLink, SessionList, SessionFeedback],
  templateUrl: './session-history.html',
  styleUrl: './session-history.css',
})
export class SessionHistory {
  readonly store = inject(SessionStore);

  readonly sessions = computed(() => previousSessions(this.store.sessions()));
}
