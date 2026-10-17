import type { Player } from './models';
import type { SessionDocument } from './session-workflow';

export const PLAYER_NAME_MAX_LENGTH = 50;

export function addPlayer(players: readonly Player[], id: string, name: string): readonly Player[] {
  const trimmed = name.trim();

  if (!trimmed || trimmed.length > PLAYER_NAME_MAX_LENGTH) {
    throw new Error(`Enter a player name between 1 and ${PLAYER_NAME_MAX_LENGTH} characters.`);
  }

  if (!id.trim() || players.some((player) => player.id === id))
    throw new Error('Player ID must be unique.');

  if (players.some((player) => player.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A player with this name already exists.');
  }

  return [...players, { id, name: trimmed }];
}

/** Count each session once, only when the player participated in a completed match. */
export function sessionsPlayed(playerId: string, documents: readonly SessionDocument[]): number {
  return new Set(
    documents
      .filter((doc) =>
        doc.session.history.some(
          (match) => match.teamA.includes(playerId) || match.teamB.includes(playerId),
        ),
      )
      .map((doc) => doc.session.id),
  ).size;
}
