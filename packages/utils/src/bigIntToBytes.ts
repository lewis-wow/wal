import { Uint8Array_ } from '@repo/types';

export function bigIntToBytes(value: bigint, output: Uint8Array_): Uint8Array_;
export function bigIntToBytes(value: bigint, length?: number): Uint8Array_;

export function bigIntToBytes(value: bigint, outputOrLength?: Uint8Array | number): Uint8Array_ {
  if (value < 0n) {
    throw new Error('Cannot encode negative bigint to bytes');
  }

  if (outputOrLength instanceof Uint8Array) {
    if (outputOrLength.length <= 0) {
      throw new Error('output must be a non-empty Uint8Array');
    }

    let temp = value;

    for (let i = outputOrLength.length - 1; i >= 0; i -= 1) {
      outputOrLength[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }

    if (temp !== 0n) {
      throw new Error('Value does not fit output buffer length');
    }

    return outputOrLength as Uint8Array_;
  }

  if (outputOrLength === undefined) {
    if (value === 0n) {
      return new Uint8Array(0);
    }

    const bytes: number[] = [];
    let temp = value;

    while (temp > 0n) {
      bytes.push(Number(temp & 0xffn));
      temp >>= 8n;
    }

    bytes.reverse();
    return new Uint8Array(bytes);
  }

  if (!Number.isInteger(outputOrLength) || outputOrLength < 0) {
    throw new Error('length must be a non-negative integer');
  }

  const output = new Uint8Array(outputOrLength);
  let temp = value;

  for (let i = output.length - 1; i >= 0; i -= 1) {
    output[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  if (temp !== 0n) {
    throw new Error('Value does not fit in the target byte length');
  }

  return output;
}
