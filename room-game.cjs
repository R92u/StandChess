'use strict';
const isSecret = (event) => event?.kind === 'ability' && event.stand === 'dust';
function seatVersion(room, side) {
  return room.version - room.privateUpdates[side === 'w' ? 'b' : 'w'];
}
function rememberDustPosition(room) {
  const game = room.game,
    s = game.state;
  if (!Object.values(s.stands).includes('dust')) return;
  if (isSecret(s.events.at(-1))) return;
  room.frames ??= [];
  const publicIndex = s.events.filter((event) => !isSecret(event)).length;
  room.frames[publicIndex] = {
    eventCount: s.events.length,
    position: s.position,
    fen: s.fen,
    mana: { ...s.mana },
    freeze: s.freeze,
    locked: { ...s.locked },
    fallen: s.fallen,
    lastMove: s.lastMove,
    verdict: game.result(),
  };
}
function roomState(room, side, index) {
  const game = room.game,
    state = game.snapshot();
  if (room.frames) {
    if (index !== undefined) {
      const { eventCount, ...frame } = structuredClone(room.frames[index]);
      Object.assign(state, frame);
      state.events.length = eventCount;
    } else {
      state.verdict = game.result();
      if (game.turn() === side)
        state.legalMoves = game.moves().map(({ detonation, ...move }) => move);
    }
    state.positions = state.positions.slice(0, 1);
    for (const board of [state.position, state.lastMove?.previous])
      if (board)
        for (const unit of Object.values(board.units))
          if (unit.color !== side) delete unit.dust;
    const foe = side === 'w' ? 'b' : 'w';
    if (state.stands[foe] === 'dust') {
      delete state.mana[foe];
      if (state.lastMove?.color === foe) delete state.lastMove.manaEarned;
    }
    if (state.lastMove)
      state.lastMove.event = state.events
        .slice(0, state.lastMove.event)
        .filter((e) => !isSecret(e)).length;
    state.events = state.events.filter((e) => !isSecret(e));
  }
  return {
    side,
    ready: Boolean(room.b),
    version: seatVersion(room, side),
    state,
  };
}
function playAction(room, side, action) {
  let ok = false;
  if (action.type === 'ability')
    ok = room.game.activate(side, action.target, action.choice);
  if (action.type === 'merge') ok = room.game.merge?.(side);
  if (
    action.type === 'move' &&
    typeof action.from === 'string' &&
    /^(?:[a-h][1-8]|i[345])(?:~[1-9]\d?)?$/.test(action.from) &&
    /^(?:[a-h][1-8]|i[345])$/.test(action.to) &&
    (action.promotion === undefined ||
      ['q', 'r', 'b', 'n'].includes(action.promotion))
  ) {
    ok = room.game.move(action.from, action.to, action.promotion);
  }
  if (!ok) return false;
  if (isSecret(room.game.state.events.at(-1))) room.privateUpdates[side]++;
  rememberDustPosition(room);
  room.version++;
  return true;
}
module.exports = { seatVersion, rememberDustPosition, roomState, playAction };
