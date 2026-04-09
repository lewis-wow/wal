import type { Uint8Array_ } from '@repo/types';

export const bytesConcat = (...chunks: [Uint8Array_, Uint8Array_, ...Uint8Array_[]]): Uint8Array_ => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};
