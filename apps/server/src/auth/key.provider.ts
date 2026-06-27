import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import type { Env } from '../config/env.validation';

/**
 * Supplies the RS256 keypair used to sign/verify access tokens (canon §8).
 * In production both keys MUST come from config. In dev/test, if they are
 * absent we generate an ephemeral pair so the server is runnable out of the
 * box — tokens then do not survive a restart, which is fine for local work.
 */
@Injectable()
export class KeyProvider {
  private readonly logger = new Logger(KeyProvider.name);
  readonly privateKey: string;
  readonly publicKey: string;

  constructor(config: ConfigService<Env, true>) {
    const priv = config.get('AUTH_JWT_PRIVATE_KEY', { infer: true });
    const pub = config.get('AUTH_JWT_PUBLIC_KEY', { infer: true });

    if (priv && pub) {
      // Allow `\n`-escaped PEMs (common in single-line env vars).
      this.privateKey = priv.replace(/\\n/g, '\n');
      this.publicKey = pub.replace(/\\n/g, '\n');
      return;
    }

    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY are required in production.',
      );
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.logger.warn(
      'Using an ephemeral RS256 keypair (dev/test). Set AUTH_JWT_PRIVATE_KEY / AUTH_JWT_PUBLIC_KEY for stable tokens.',
    );
  }
}
