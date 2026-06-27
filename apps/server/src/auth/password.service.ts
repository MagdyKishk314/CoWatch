import { Injectable } from '@nestjs/common';
import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * Argon2id password hashing (canon §8 / SECURITY.md). Uses prebuilt native
 * bindings (`@node-rs/argon2`) so there is no node-gyp build step on Windows.
 */
const ARGON2ID_OPTIONS: Options = {
  // OWASP-aligned moderate settings; tune with SECURITY review before launch.
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2ID_OPTIONS);
  }

  async verify(hashString: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashString, plain, ARGON2ID_OPTIONS);
    } catch {
      // A malformed hash must never throw into the auth path — treat as mismatch.
      return false;
    }
  }
}
