import { TokenKind } from '@cowatch/types';
import { makeTokenService } from '../../test/test-utils';

describe('TokenService', () => {
  it('signs and verifies an RS256 access token round-trip', async () => {
    const tokens = makeTokenService();
    const jwt = await tokens.signAccessToken({
      userId: 'u1',
      sessionId: 's1',
      roles: ['member'],
      isGuest: false,
    });
    const claims = await tokens.verifyAccessToken(jwt);
    expect(claims.sub).toBe('u1');
    expect(claims.sid).toBe('s1');
    expect(claims.kind).toBe(TokenKind.Access);
    expect(claims.roles).toEqual(['member']);
    expect(claims.isGuest).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const tokens = makeTokenService();
    const jwt = await tokens.signAccessToken({
      userId: 'u',
      sessionId: 's',
      roles: [],
      isGuest: false,
    });
    await expect(tokens.verifyAccessToken(`${jwt}x`)).rejects.toBeDefined();
  });

  it('hashes refresh secrets deterministically and compares constant-time', () => {
    const tokens = makeTokenService();
    const { secret, hash } = tokens.issueRefreshSecret();
    expect(tokens.hashSecret(secret)).toBe(hash);
    expect(tokens.safeEqualHex(hash, hash)).toBe(true);
    expect(tokens.safeEqualHex(hash, tokens.hashSecret('other'))).toBe(false);
  });

  it('parses and rejects composite refresh tokens', () => {
    const tokens = makeTokenService();
    expect(tokens.parseRefreshToken('abc.def')).toEqual({
      sessionId: 'abc',
      secret: 'def',
    });
    expect(tokens.parseRefreshToken('nodot')).toBeNull();
    expect(tokens.parseRefreshToken('.x')).toBeNull();
    expect(tokens.parseRefreshToken('x.')).toBeNull();
  });
});
