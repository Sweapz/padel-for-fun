import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlayerSessionSummary } from '../../../domain/player-history';
import { MATCH_POINTS } from '../../../domain/rules';

@Component({
  selector: 'app-player-trend',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './player-trend.html',
  styleUrl: './player-trend.css',
})
export class PlayerTrend {
  readonly sessions = input.required<readonly PlayerSessionSummary[]>();

  readonly metric = signal<'average' | 'points'>('average');

  readonly playedSessions = computed(() => this.sessions().filter((session) => session.played > 0));
  readonly title = computed(() =>
    this.metric() === 'average'
      ? 'Average points per match by session'
      : 'Total points per session',
  );
  readonly maximum = computed(() =>
    Math.max(
      this.metric() === 'average' ? MATCH_POINTS : 1,
      ...this.playedSessions().map((session) => this.value(session)),
    ),
  );

  readonly chartPoints = computed(() =>
    this.playedSessions().map((session, index, sessions) => ({
      id: session.sessionId,
      sessionNumber: index + 1,
      x: sessions.length === 1 ? 50 : 3 + (index / (sessions.length - 1)) * 94,
      y: (this.value(session) / this.maximum()) * 100,
    })),
  );
  readonly linePoints = computed(() =>
    this.chartPoints()
      .map((point) => `${point.x},${100 - point.y}`)
      .join(' '),
  );
  readonly ticks = computed(() =>
    Array.from({ length: 5 }, (_, index) => ({
      position: index * 25,
      value: this.maximum() * (1 - index / 4),
    })),
  );
  readonly minimumChartWidth = computed(() => Math.max(0, (this.playedSessions().length - 1) * 56));

  value(session: PlayerSessionSummary): number {
    return this.metric() === 'average' ? (session.average ?? 0) : session.points;
  }

  changeMetric(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (value === 'average' || value === 'points') this.metric.set(value);
  }
}
