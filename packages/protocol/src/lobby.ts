import { z } from 'zod';

import { PROTOCOL_VERSION } from './constants.js';

const idSchema = z.string().min(1).max(64);
const nicknameSchema = z.string().min(1).max(32);
const lobbyIdSchema = z.string().min(1).max(64);
const roomIdSchema = z.string().min(1).max(64);
const gameIdSchema = z.string().min(1).max(64);
const chatTextSchema = z.string().min(1).max(1000);

const lobbyPlayerSchema = z.object({
  playerId: idSchema,
  guestId: idSchema,
  nickname: nicknameSchema,
  isHost: z.boolean(),
  isReady: z.boolean(),
  voteGameId: gameIdSchema.nullable(),
});

const lobbyChatMessagePayloadSchema = z.object({
  lobbyId: lobbyIdSchema,
  messageId: idSchema,
  playerId: idSchema,
  nickname: nicknameSchema,
  text: chatTextSchema,
  sentAtMs: z.number().int().nonnegative(),
});

const lobbyStatePayloadSchema = z.object({
  lobbyId: lobbyIdSchema,
  hostPlayerId: idSchema,
  phase: z.enum(['waiting', 'starting', 'in_game', 'closed']),
  selectedGameId: gameIdSchema.nullable(),
  players: z.array(lobbyPlayerSchema),
  votesByPlayerId: z.record(idSchema, gameIdSchema),
});

export const lobbyCreateMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.create'),
  payload: z.object({
    guestId: idSchema,
    nickname: nicknameSchema,
    lobbyName: z.string().min(1).max(64).optional(),
  }),
});

export const lobbyJoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.join'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    guestId: idSchema,
    nickname: nicknameSchema,
  }),
});

export const lobbyLeaveMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.leave'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    guestId: idSchema,
    reason: z.string().min(1).max(256).optional(),
  }),
});

export const lobbyChatSendMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.chat.send'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    playerId: idSchema,
    text: chatTextSchema,
  }),
});

export const lobbyChatMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.chat.message'),
  payload: lobbyChatMessagePayloadSchema,
});

export const lobbyVoteCastMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.vote.cast'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    playerId: idSchema,
    gameId: gameIdSchema,
  }),
});

export const lobbyStateMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.state'),
  payload: lobbyStatePayloadSchema,
});

export const lobbyReadySetMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.ready.set'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    playerId: idSchema,
    isReady: z.boolean(),
  }),
});

export const lobbyStartRequestMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.start.request'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    requestedByPlayerId: idSchema,
  }),
});

export const lobbyStartAcceptedMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.start.accepted'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    roomId: roomIdSchema,
    gameId: gameIdSchema,
    seed: z.number().int(),
    tickRate: z.number().int().positive(),
    startedAtMs: z.number().int().nonnegative(),
  }),
});

export const lobbyErrorMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.error'),
  payload: z.object({
    lobbyId: lobbyIdSchema.optional(),
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(256),
    details: z.unknown().optional(),
  }),
});

export const lobbyClientMessageSchemas = [
  lobbyCreateMessageSchema,
  lobbyJoinMessageSchema,
  lobbyLeaveMessageSchema,
  lobbyChatSendMessageSchema,
  lobbyVoteCastMessageSchema,
  lobbyReadySetMessageSchema,
  lobbyStartRequestMessageSchema,
] as const;

export const lobbyServerMessageSchemas = [
  lobbyChatMessageSchema,
  lobbyStateMessageSchema,
  lobbyStartAcceptedMessageSchema,
  lobbyErrorMessageSchema,
] as const;

export const lobbyMessageSchemas = [
  ...lobbyClientMessageSchemas,
  ...lobbyServerMessageSchemas,
] as const;

export const lobbyClientMessageSchema = z.discriminatedUnion('type', lobbyClientMessageSchemas);
export const lobbyServerMessageSchema = z.discriminatedUnion('type', lobbyServerMessageSchemas);
export const lobbyMessageSchema = z.discriminatedUnion('type', lobbyMessageSchemas);

export type LobbyClientMessage = z.infer<typeof lobbyClientMessageSchema>;
export type LobbyServerMessage = z.infer<typeof lobbyServerMessageSchema>;
export type LobbyMessage = z.infer<typeof lobbyMessageSchema>;
