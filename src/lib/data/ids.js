const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n, alphabet) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function generateInviteCode() {
  return `${randomChars(4, ALPHABET)}-${randomChars(4, ALPHABET)}`;
}

export function generateId() {
  return randomChars(20, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
}

export function fakeSha() {
  return randomChars(40, '0123456789abcdef');
}
