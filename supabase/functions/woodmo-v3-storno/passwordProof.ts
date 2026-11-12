/**
 * Verify an existing WOODMO staff password on the server.
 *
 * Matches src/lib/staffDirectory.ts: PBKDF2-HMAC-SHA256,
 * 210_000 iterations, 16-byte salt and 32-byte derived key.
 * NEVER accepts a client-supplied hash as proof of identity.
 */
const PBKDF2_ITERATIONS = 210_000;

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Invalid password verifier.');
  }
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function verifyExistingStaffPassword(
  password: string,
  passwordSalt: string | null,
  passwordHash: string | null,
): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0 || password.length > 256 ||
      !passwordSalt || !passwordHash) return false;
  try {
    const salt = decodeBase64(passwordSalt);
    const expected = decodeBase64(passwordHash);
    if (salt.length !== 16 || expected.length !== 32) return false;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
    );
    const derived = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
      key,
      256,
    ));
    // Byte-wise comparison without early exit; do not log password or hashes.
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ derived[i];
    return mismatch === 0;
  } catch {
    return false;
  }
}
