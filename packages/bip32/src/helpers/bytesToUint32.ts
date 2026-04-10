import { assert } from '@repo/assert';

export const bytesToUint32 = (value: Uint8Array): number => {
  assert(value.length === 4, 'Expected a 4-byte uint32 value');
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  return view.getUint32(0, false);
};
