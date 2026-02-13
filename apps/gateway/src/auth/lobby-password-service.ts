import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { LobbyPasswordHash } from '../lobby/lobby-types.js';

const SCRYPT_KEY_LENGTH = 64;

export interface LobbyPasswordService {
  hashPassword(password: string): LobbyPasswordHash;
  verifyPassword(password: string, hash: LobbyPasswordHash): boolean;
}

export function createLobbyPasswordService(): LobbyPasswordService {
  return {
    hashPassword(password: string): LobbyPasswordHash {
      const salt = randomBytes(16).toString('hex');
      const digest = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');

      return {
        algorithm: 'scrypt_v1',
        salt,
        digest,
      };
    },

    verifyPassword(password: string, hash: LobbyPasswordHash): boolean {
      if (hash.algorithm !== 'scrypt_v1') {
        return false;
      }

      try {
        const expectedDigest = Buffer.from(hash.digest, 'hex');
        const actualDigest = scryptSync(password, hash.salt, SCRYPT_KEY_LENGTH);

        if (expectedDigest.length !== actualDigest.length) {
          return false;
        }

        return timingSafeEqual(expectedDigest, actualDigest);
      } catch {
        return false;
      }
    },
  };
}
