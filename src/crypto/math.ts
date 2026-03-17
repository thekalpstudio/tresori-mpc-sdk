export const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

export function mod(a: bigint, b: bigint): bigint {
  return ((a % b) + b) % b;
}

export function modInverse(a: bigint, m: bigint): bigint {
  a = mod(a, m);
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }

  if (old_r !== 1n) throw new Error('Modular inverse does not exist');
  return mod(old_s, m);
}

export function lagrangeCoefficient(i: number, indices: number[], n: bigint = CURVE_ORDER): bigint {
  let lambda = 1n;
  const iBig = BigInt(i);

  for (const j of indices) {
    if (j !== i) {
      const jBig = BigInt(j);
      const numerator = jBig;
      const denominator = mod(jBig - iBig, n);
      lambda = mod(lambda * numerator * modInverse(denominator, n), n);
    }
  }

  return lambda;
}

export function evaluatePolynomial(coefficients: bigint[], x: number): bigint {
  let result = 0n;
  let xPow = 1n;
  const xBig = BigInt(x);

  for (const coef of coefficients) {
    result = mod(result + coef * xPow, CURVE_ORDER);
    xPow = mod(xPow * xBig, CURVE_ORDER);
  }

  return result;
}

export function toHex(value: bigint, bytes = 32): string {
  let hex = value.toString(16);
  while (hex.length < bytes * 2) hex = '0' + hex;
  return '0x' + hex;
}

export function fromHex(hex: string): bigint {
  if (hex.startsWith('0x')) hex = hex.slice(2);
  return BigInt('0x' + hex);
}

export function rlpUint(value: number | bigint): string {
  const v = BigInt(value);
  if (v === 0n) return '0x';
  const hex = v.toString(16);
  return '0x' + (hex.length % 2 ? '0' + hex : hex);
}
