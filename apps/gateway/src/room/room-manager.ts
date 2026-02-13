import { randomInt } from 'node:crypto';

export interface RoomRecord {
  roomId: string;
  lobbyId: string;
  gameId: string;
  seed: number;
  tickRate: number;
  createdAtMs: number;
  playerIds: string[];
}

interface CreateRoomInput {
  lobbyId: string;
  gameId: string;
  tickRate: number;
  createdAtMs: number;
  playerIds: string[];
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
    const room: RoomRecord = {
      roomId: this.nextRoomId(),
      lobbyId: input.lobbyId,
      gameId: input.gameId,
      seed: this.nextSeed(),
      tickRate: input.tickRate,
      createdAtMs: input.createdAtMs,
      playerIds: [...input.playerIds],
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
}
