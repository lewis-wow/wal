import type { Uint8Array_ } from '@repo/types';

export const bytesToArrayBuffer = (bytes: Uint8Array_): ArrayBuffer => {
  const view = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;

  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
};
