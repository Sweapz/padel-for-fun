import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { TeamScores, TeamSide } from '../../../domain/models';
import { deriveScores, MATCH_POINTS, validateScores } from '../../../domain/scoring';

@Component({
  selector: 'app-score-entry',
  templateUrl: './score-entry.html',
  styleUrl: './score-entry.css',
  host: {
    '(document:click)': 'dismissOutside($event)',
    '(keydown.escape)': 'closePicker()',
    '(focusout)': 'dismissOnFocusOut($event)',
  },
})
export class ScoreEntry {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly busy = input(false);
  readonly confirmed = output<TeamScores>();

  readonly sides = [
    { id: 'teamA', label: 'Team A', testId: 'score-a' },
    { id: 'teamB', label: 'Team B', testId: 'score-b' },
  ] as const;
  readonly scores = Array.from({ length: MATCH_POINTS }, (_, score) => score + 1);
  readonly pickerColumns = 4;
  readonly a = signal('');
  readonly b = signal('');
  readonly picker = signal<TeamSide | null>(null);

  readonly valid = computed(
    () => validateScores(this.number(this.a()), this.number(this.b())).valid,
  );
  readonly pickerPanel = viewChild<ElementRef<HTMLElement>>('pickerPanel');

  constructor() {
    effect(() => {
      const panel = this.pickerPanel();
      const side = this.picker();

      if (panel && side) {
        const value = side === 'teamA' ? this.a() : this.b();
        const selected = this.scores.includes(Number(value)) ? value : String(this.scores[0]);
        panel.nativeElement.querySelector<HTMLButtonElement>(`[data-score="${selected}"]`)?.focus();
      }
    });
  }

  private number(value: string): unknown {
    return value === '' ? null : Number(value);
  }

  openPicker(side: TeamSide): void {
    if (this.busy()) return;

    this.picker.set(this.picker() === side ? null : side);
  }

  selectScore(score: number): void {
    const side = this.picker();

    if (!side || this.busy() || !this.scores.includes(score)) return;

    const result = deriveScores(side, score);

    if (!result.valid) return;

    this.a.set(String(result.scores.teamA));
    this.b.set(String(result.scores.teamB));
    this.closePicker();
  }

  closePicker(): void {
    const side = this.picker();

    this.picker.set(null);

    if (side)
      this.element.nativeElement.querySelector<HTMLButtonElement>(`[data-team="${side}"]`)?.focus();
  }

  dismissOutside(event: Event): void {
    if (!this.element.nativeElement.contains(event.target as Node)) this.picker.set(null);
  }

  dismissOnFocusOut(event: FocusEvent): void {
    if (!this.element.nativeElement.contains(event.relatedTarget as Node | null))
      this.picker.set(null);
  }

  navigatePicker(event: KeyboardEvent): void {
    const button = event.target as HTMLButtonElement;
    const current = Number(button.dataset['score']);
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = current + 1;
        break;
      case 'ArrowLeft':
        next = current - 1;
        break;
      case 'ArrowDown':
        next = current + this.pickerColumns;
        break;
      case 'ArrowUp':
        next = current - this.pickerColumns;
        break;
      case 'Home':
        next = this.scores[0];
        break;
      case 'End':
        next = MATCH_POINTS;
        break;
      default:
        return;
    }

    event.preventDefault();
    next = Math.max(this.scores[0], Math.min(MATCH_POINTS, next));
    this.pickerPanel()
      ?.nativeElement.querySelector<HTMLButtonElement>(`[data-score="${next}"]`)
      ?.focus();
  }

  confirm(event: Event): void {
    event.preventDefault();

    if (this.busy()) return;

    const result = validateScores(this.number(this.a()), this.number(this.b()));

    if (result.valid) this.confirmed.emit(result.scores);
  }
}
