export const bigIntBitLength = (value: bigint): number => {
  if (value <= 0n) {
    return 0;
  }

  return value.toString(2).length;
};
