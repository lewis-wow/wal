import { SLIP39_CHECKSUM_LENGTH_WORDS } from '../consts.js';

const RS1024_GENERATORS = [
  0xe0e040, 0x1c1c080, 0x3838100, 0x7070200, 0xe0e0009, 0x1c0c2412, 0x38086c24, 0x3090fc48, 0x21b1f890, 0x3f3f120,
] as const;

const polymod = (values: readonly number[]): number => {
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 20;
    checksum = ((checksum & 0x000fffff) << 10) ^ value;

    for (let i = 0; i < RS1024_GENERATORS.length; i += 1) {
      if (((top >> i) & 1) === 1) {
        checksum ^= RS1024_GENERATORS[i]!;
      }
    }
  }

  return checksum;
};

const customizationValues = (customizationString: string): number[] => {
  return Array.from(customizationString, (char) => char.charCodeAt(0));
};

export const createChecksum = (data: readonly number[], customizationString: string): number[] => {
  const values = [
    ...customizationValues(customizationString),
    ...data,
    ...new Array(SLIP39_CHECKSUM_LENGTH_WORDS).fill(0),
  ];
  const mod = polymod(values) ^ 1;

  return Array.from({ length: SLIP39_CHECKSUM_LENGTH_WORDS }, (_, i) => {
    return (mod >> (10 * (SLIP39_CHECKSUM_LENGTH_WORDS - 1 - i))) & 1023;
  });
};

export const verifyChecksum = (data: readonly number[], customizationString: string): boolean => {
  return polymod([...customizationValues(customizationString), ...data]) === 1;
};
