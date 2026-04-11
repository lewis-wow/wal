export const UINT32_MAX = 0xffffffff;

export const uint32ToBytes = (value: number): Uint8Array => {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error('Value must be a uint32');
  }

  const out = new Uint8Array(4);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, value, false);
  return out;
};
