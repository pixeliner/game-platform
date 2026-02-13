import { z } from 'zod';

import { PROTOCOL_VERSION } from './constants.js';

const idSchema = z.string().min(1).max(64);
const roomIdSchema = z.string().min(1).max(64);
const gameIdSchema = z.string().min(1).max(64);
const nicknameSchema = z.string().min(1).max(32);

export const gameJoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.join'),
  payload: z.object({
    roomId: roomIdSchema,
    playerId: idSchema,
  }),
});

export const gameJoinAcceptedMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.join.accepted'),
  payload: z.object({
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    playerId: idSchema,
    tick: z.number().int().nonnegative(),
    joinedAtMs: z.number().int().nonnegative(),
  }),
});

export const gameSpectateJoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.spectate.join'),
  payload: z.object({
    roomId: roomIdSchema,
    guestId: idSchema,
    nickname: nicknameSchema,
  }),
});

export const gameSpectateJoinedMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.spectate.joined'),
  payload: z.object({
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    spectatorId: idSchema,
    tick: z.number().int().nonnegative(),
    joinedAtMs: z.number().int().nonnegative(),
  }),
});

export const gameLeaveMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.leave'),
  payload: z.object({
    roomId: roomIdSchema,
    playerId: idSchema,
    reason: z.string().min(1).max(256).optional(),
  }),
});

export const gameInputMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.input'),
  payload: z.object({
    roomId: roomIdSchema,
    playerId: idSchema,
    tick: z.number().int().nonnegative(),
    input: z.unknown(),
  }),
});

export const gameSnapshotMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.snapshot'),
  payload: z.object({
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    tick: z.number().int().nonnegative(),
    snapshot: z.unknown(),
  }),
});

export const gameEventMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.event'),
  payload: z.object({
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    eventId: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    event: z.unknown(),
  }),
});

export const gameOverMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('game.over'),
  payload: z.object({
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    endedAtMs: z.number().int().nonnegative(),
    results: z.array(
      z.object({
        playerId: idSchema,
        rank: z.number().int().positive(),
        score: z.number().int().optional(),
      }),
    ),
  }),
});

export const gameClientMessageSchemas = [
  gameJoinMessageSchema,
  gameSpectateJoinMessageSchema,
  gameLeaveMessageSchema,
  gameInputMessageSchema,
] as const;

export const gameServerMessageSchemas = [
  gameJoinAcceptedMessageSchema,
  gameSpectateJoinedMessageSchema,
  gameSnapshotMessageSchema,
  gameEventMessageSchema,
  gameOverMessageSchema,
] as const;

export const gameMessageSchemas = [...gameClientMessageSchemas, ...gameServerMessageSchemas] as const;

export const gameClientMessageSchema = z.discriminatedUnion('type', gameClientMessageSchemas);
export const gameServerMessageSchema = z.discriminatedUnion('type', gameServerMessageSchemas);
export const gameMessageSchema = z.discriminatedUnion('type', gameMessageSchemas);

export type GameClientMessage = z.infer<typeof gameClientMessageSchema>;
export type GameServerMessage = z.infer<typeof gameServerMessageSchema>;
export type GameMessage = z.infer<typeof gameMessageSchema>;

export type GameJoinMessage = z.infer<typeof gameJoinMessageSchema>;
export type GameJoinAcceptedMessage = z.infer<typeof gameJoinAcceptedMessageSchema>;
export type GameSpectateJoinMessage = z.infer<typeof gameSpectateJoinMessageSchema>;
export type GameSpectateJoinedMessage = z.infer<typeof gameSpectateJoinedMessageSchema>;
export type GameLeaveMessage = z.infer<typeof gameLeaveMessageSchema>;
export type GameInputMessage = z.infer<typeof gameInputMessageSchema>;
export type GameSnapshotMessage = z.infer<typeof gameSnapshotMessageSchema>;
export type GameEventMessage = z.infer<typeof gameEventMessageSchema>;
export type GameOverMessage = z.infer<typeof gameOverMessageSchema>;
