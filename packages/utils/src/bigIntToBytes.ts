import type { Uint8Array_ } from '@repo/types';

export const bigIntToBytes = (value: bigint, output: Uint8Array_): Uint8Array_ => {
  if (value < 0n) {
    throw new Error('Cannot encode negative bigint to bytes');
  }

  if (output.length <= 0) {
    throw new Error('output must be a non-empty Uint8Array');
  }

  let temp = value;

  for (let i = output.length - 1; i >= 0; i -= 1) {
    output[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  if (temp !== 0n) {
    throw new Error('Value does not fit output buffer length');
  }

  return output;
};
