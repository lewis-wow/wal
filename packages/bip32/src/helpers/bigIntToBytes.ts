import { assert } from '@repo/assert';

export const bigIntToBytes = (value: bigint, length?: number): Uint8Array => {
  assert(value >= 0n, 'Cannot serialize negative bigint');

  if (length !== undefined) {
    assert(Number.isInteger(length) && length >= 0, 'Byte length must be a non-negative integer');
    const out = new Uint8Array(length);
    let current = value;

    for (let i = length - 1; i >= 0; i -= 1) {
      out[i] = Number(current & 0xffn);
      current >>= 8n;
    }

    assert(current === 0n, 'Bigint does not fit in the target byte length');
    return out;
  }

  if (value === 0n) {
    return new Uint8Array(0);
  }

  const bytes: number[] = [];
  let current = value;
  while (current > 0n) {
    bytes.push(Number(current & 0xffn));
    current >>= 8n;
  }

  bytes.reverse();
  return new Uint8Array(bytes);
};
