export const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let result = 0n;

  for (const byte of bytes) {
    result = (result << 8n) + BigInt(byte);
  }

  return result;
};
