// Helper to mint a new API key.
// Format: agk_<24 random base32 chars>
//   prefix (12 chars): "agk_" + 8 random chars — used for fast lookup
//   body (12 chars):   more random chars — combined with prefix becomes the full token
// Returns { plaintext, prefix, suffix }. The plaintext is shown ONCE to the user.
import crypto from 'crypto';

// Crockford base32 alphabet (no 0/O/1/I confusion)
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function randomBase32(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateApiKey() {
  // Full plaintext: agk_ + 24 random chars = 29 chars total
  const body = randomBase32(24);
  const plaintext = `agk_${body}`;
  const prefix = plaintext.slice(0, 12); // "agk_" + 8 chars
  const suffix = plaintext.slice(-4);    // last 4 chars, shown for ID only
  return { plaintext, prefix, suffix };
}
