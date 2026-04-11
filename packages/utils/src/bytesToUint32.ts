export const bytesToUint32 = (value: Uint8Array): number => {
  if (value.length !== 4) {
    throw new Error('Expected a 4-byte uint32 value');
  }

  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  return view.getUint32(0, false);
};
