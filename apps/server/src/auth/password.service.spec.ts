import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('s3cret-password');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(hash, 's3cret-password')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await svc.hash('right-password');
    expect(await svc.verify(hash, 'wrong-password')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await svc.verify('not-a-real-hash', 'whatever')).toBe(false);
  });
});
