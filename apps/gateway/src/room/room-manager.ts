import { randomInt } from 'node:crypto';

export interface RoomRecord {
  matchId: string;
  roomId: string;
  lobbyId: string;
  gameId: string;
  seed: number;
  tickRate: number;
  createdAtMs: number;
  startedAtMs: number;
  playerIds: string[];
  participants: RoomParticipant[];
  status: 'active' | 'stopped';
  stoppedAtMs?: number;
}

export interface RoomParticipant {
  playerId: string;
  guestId: string;
  nickname: string;
}

interface CreateRoomInput {
  matchId: string;
  lobbyId: string;
  gameId: string;
  tickRate: number;
  createdAtMs: number;
  startedAtMs: number;
  participants: RoomParticipant[];
}

interface RoomManagerOptions {
  nextRoomId?: () => string;
  nextSeed?: () => number;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly nextRoomId: () => string;
  private readonly nextSeed: () => number;

  public constructor(options: RoomManagerOptions = {}) {
    this.nextRoomId = options.nextRoomId ?? (() => `room_${randomInt(1_000_000_000).toString(16)}`);
    this.nextSeed = options.nextSeed ?? (() => randomInt(0, 2_147_483_647));
  }

  public createRoom(input: CreateRoomInput): RoomRecord {
    const participants = [...input.participants];
    const room: RoomRecord = {
      matchId: input.matchId,
      roomId: this.nextRoomId(),
      lobbyId: input.lobbyId,
      gameId: input.gameId,
      seed: this.nextSeed(),
      tickRate: input.tickRate,
      createdAtMs: input.createdAtMs,
      startedAtMs: input.startedAtMs,
      playerIds: participants.map((participant) => participant.playerId),
      participants,
      status: 'active',
    };

    this.rooms.set(room.roomId, room);
    return room;
  }

  public getRoom(roomId: string): RoomRecord | undefined {
    return this.rooms.get(roomId);
  }

  public getRooms(): RoomRecord[] {
    return [...this.rooms.values()];
  }

  public markStopped(roomId: string, stoppedAtMs: number): RoomRecord | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    room.status = 'stopped';
    room.stoppedAtMs = stoppedAtMs;
    return room;
  }
}
