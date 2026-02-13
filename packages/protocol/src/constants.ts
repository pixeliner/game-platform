export const PROTOCOL_VERSION = 1 as const;
export const ADMIN_TICK_RATE_MIN = 10 as const;
export const ADMIN_TICK_RATE_MAX = 60 as const;

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
  'lobby.admin.monitor.request',
  'lobby.admin.tick_rate.set',
  'lobby.admin.kick',
  'lobby.admin.start.force',
  'lobby.admin.room.pause',
  'lobby.admin.room.resume',
  'lobby.admin.room.stop',
  'lobby.admin.room.force_end',
  'lobby.admin.monitor.state',
  'lobby.admin.action.result',
  'lobby.auth.issued',
  'lobby.error',
] as const;

export const GAME_MESSAGE_TYPES = [
  'game.join',
  'game.join.accepted',
  'game.spectate.join',
  'game.spectate.joined',
  'game.leave',
  'game.input',
  'game.snapshot',
  'game.event',
  'game.over',
] as const;

export type LobbyMessageType = (typeof LOBBY_MESSAGE_TYPES)[number];
export type GameMessageType = (typeof GAME_MESSAGE_TYPES)[number];
export type ProtocolMessageType = LobbyMessageType | GameMessageType;
