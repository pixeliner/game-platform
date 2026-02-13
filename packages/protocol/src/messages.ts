import { z } from 'zod';

import {
  gameClientMessageSchema,
  gameClientMessageSchemas,
  gameMessageSchema,
  gameServerMessageSchema,
  gameServerMessageSchemas,
} from './game.js';
import {
  lobbyClientMessageSchema,
  lobbyClientMessageSchemas,
  lobbyMessageSchema,
  lobbyServerMessageSchema,
  lobbyServerMessageSchemas,
} from './lobby.js';

export const clientMessageSchemas = [...lobbyClientMessageSchemas, ...gameClientMessageSchemas] as const;
export const serverMessageSchemas = [...lobbyServerMessageSchemas, ...gameServerMessageSchemas] as const;
export const protocolMessageSchemas = [...clientMessageSchemas, ...serverMessageSchemas] as const;

export const clientMessageSchema = z.discriminatedUnion('type', clientMessageSchemas);
export const serverMessageSchema = z.discriminatedUnion('type', serverMessageSchemas);
export const protocolMessageSchema = z.discriminatedUnion('type', protocolMessageSchemas);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ProtocolMessage = z.infer<typeof protocolMessageSchema>;

export { gameClientMessageSchema, gameMessageSchema, gameServerMessageSchema };
export { lobbyClientMessageSchema, lobbyMessageSchema, lobbyServerMessageSchema };
