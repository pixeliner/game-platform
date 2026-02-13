export const PROTOCOL_VERSION = 1 as const;

export const LOBBY_MESSAGE_TYPES = [
  'lobby.create',
  'lobby.join',
  'lobby.leave',
  'lobby.chat.send',
  'lobby.chat.message',
  'lobby.vote.cast',
  'lobby.state',
  'lobby.ready.set',
  'lobby.start.request',
  'lobby.start.accepted',
  'lobby.auth.issued',
  'lobby.error',
] as const;

export const GAME_MESSAGE_TYPES = [
  'game.join',
  'game.join.accepted',
  'game.leave',
  'game.input',
  'game.snapshot',
  'game.event',
  'game.over',
] as const;

export type LobbyMessageType = (typeof LOBBY_MESSAGE_TYPES)[number];
export type GameMessageType = (typeof GAME_MESSAGE_TYPES)[number];
export type ProtocolMessageType = LobbyMessageType | GameMessageType;
