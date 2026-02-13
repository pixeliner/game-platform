import { z } from 'zod';

import { PROTOCOL_VERSION } from './constants.js';

const idSchema = z.string().min(1).max(64);
const nicknameSchema = z.string().min(1).max(32);
const lobbyIdSchema = z.string().min(1).max(64);
const roomIdSchema = z.string().min(1).max(64);
const gameIdSchema = z.string().min(1).max(64);
const chatTextSchema = z.string().min(1).max(1000);
const lobbyNameSchema = z.string().min(1).max(64);
const lobbyPasswordSchema = z.string().min(4).max(64);

const lobbyPlayerSchema = z.object({
  playerId: idSchema,
  guestId: idSchema,
  nickname: nicknameSchema,
  isHost: z.boolean(),
  isReady: z.boolean(),
  voteGameId: gameIdSchema.nullable(),
  isConnected: z.boolean(),
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
  lobbyName: lobbyNameSchema,
  hostPlayerId: idSchema,
  phase: z.enum(['waiting', 'starting', 'in_game', 'closed']),
  activeRoomId: roomIdSchema.nullable(),
  selectedGameId: gameIdSchema.nullable(),
  requiresPassword: z.boolean(),
  maxPlayers: z.number().int().positive(),
  players: z.array(lobbyPlayerSchema),
  votesByPlayerId: z.record(idSchema, gameIdSchema),
});

export const lobbyCreateMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.create'),
  payload: z.object({
    guestId: idSchema,
    nickname: nicknameSchema,
    lobbyName: lobbyNameSchema.optional(),
    password: lobbyPasswordSchema.optional(),
  }),
});

export const lobbyJoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.join'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    guestId: idSchema,
    nickname: nicknameSchema,
    sessionToken: z.string().min(1).max(2048).optional(),
    password: lobbyPasswordSchema.optional(),
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

export const lobbyAuthIssuedMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('lobby.auth.issued'),
  payload: z.object({
    lobbyId: lobbyIdSchema,
    playerId: idSchema,
    guestId: idSchema,
    sessionToken: z.string().min(1).max(2048),
    expiresAtMs: z.number().int().nonnegative(),
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
  lobbyAuthIssuedMessageSchema,
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

export type LobbyCreateMessage = z.infer<typeof lobbyCreateMessageSchema>;
export type LobbyJoinMessage = z.infer<typeof lobbyJoinMessageSchema>;
export type LobbyLeaveMessage = z.infer<typeof lobbyLeaveMessageSchema>;
export type LobbyChatSendMessage = z.infer<typeof lobbyChatSendMessageSchema>;
export type LobbyChatMessage = z.infer<typeof lobbyChatMessageSchema>;
export type LobbyVoteCastMessage = z.infer<typeof lobbyVoteCastMessageSchema>;
export type LobbyStateMessage = z.infer<typeof lobbyStateMessageSchema>;
export type LobbyReadySetMessage = z.infer<typeof lobbyReadySetMessageSchema>;
export type LobbyStartRequestMessage = z.infer<typeof lobbyStartRequestMessageSchema>;
export type LobbyStartAcceptedMessage = z.infer<typeof lobbyStartAcceptedMessageSchema>;
export type LobbyAuthIssuedMessage = z.infer<typeof lobbyAuthIssuedMessageSchema>;
export type LobbyErrorMessage = z.infer<typeof lobbyErrorMessageSchema>;
