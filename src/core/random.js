/**
 * Seedable PRNG — xorshift32.
 * Deterministic: same seed always yields the same sequence on any platform.
 */
export function createRng(seed) {
  // Normalise to a non-zero unsigned 32-bit seed.
  let x = (Number(seed) | 0) >>> 0;
  if (x === 0) x = 0x2545f491; // avoid the all-zero state of xorshift32

  function nextU32() {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  }

  /** Uniform float in [0, 1). */
  function next() {
    return nextU32() / 4294967296;
  }

  /** Uniform int in [0, n). Assumes n > 0. */
  function nextInt(n) {
    if (n <= 1) return 0;
    return Math.floor(next() * n);
  }

  return { next, nextInt, nextU32 };
}
