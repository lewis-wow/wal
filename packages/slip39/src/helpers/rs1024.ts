import { SLIP39_CHECKSUM_LENGTH_WORDS } from '../consts.js';

// (x - a)(x - a^2)(x - a^3)
const GEN = [
  0xe0e040, 0x1c1c080, 0x3838100, 0x7070200, 0xe0e0009, 0x1c0c2412, 0x38086c24, 0x3090fc48, 0x21b1f890, 0x3f3f120,
];

const polymod = (values: number[]): number => {
  // 30 bit buffer
  let checksum = 1; // 00 0000 0000 0000 0000 0000 0000 0001

  for (const value of values) {
    // at the start: 0 ([00 0000 0000] 0000 0000 0000 0000 0001)
    const top10Bits = checksum >> 20;

    // value example: 1 = 00 0000 0001
    // bit=9 -> 0
    // bit=8 -> 0
    // ...
    // bit=0 -> 1

    // 0x1fffffff: 0001 1111 1111 1111 1111 1111 1111 1111 (29) To pick only 29 bits
    // Pick 29 bits and shift them by 1 -> 00 0000 0000 0000 0000 0000 0000 0010
    // i=9 -> Add (XOR in binary base) bit from value: 00 0000 0000 0000 0000 0000 0000 0010
    // i=8 -> Add (XOR in binary base) bit from value: 00 0000 0000 0000 0000 0000 0000 0100
    // ...
    // i=0 -> Add (XOR in binary base) bit from value: 00 0000 0000 0000 0000 0100 0000 0001
    checksum = ((checksum & 0xfffff) << 10) ^ value;

    // For each shifted top bit (we shifted top 10 bits)
    for (let i = 0; i < 10; i++) {
      // If the top (30th) bit overflow (was 1), substract (XOR in binary base) G as the number has more than 30 bits now
      if ((top10Bits >> i) & 1) {
        checksum ^= GEN[i]!;
      }
    }
  }

  return checksum;
};

const customizationValues = (customizationString: string): number[] => {
  return Array.from(customizationString, (char) => char.charCodeAt(0));
};

export const createChecksum = (data: number[], customizationString: string): number[] => {
  const values = [
    ...customizationValues(customizationString),
    ...data, // each word has 10bits
    // empty space for checksum: 3*10bits = 30bits
    ...new Array(SLIP39_CHECKSUM_LENGTH_WORDS).fill(0),
  ];

  // mod = 30-bit number, add (XOR in binary base) 1
  const mod = polymod(values) ^ 1;

  return Array.from({ length: SLIP39_CHECKSUM_LENGTH_WORDS }, (_, i) => {
    // i=0: 20bit shift, first 10 bits
    // i=1: 10bit shift, middle 10 bits
    // i=2: 0bit shift, last 10 bits
    return (mod >> (10 * (SLIP39_CHECKSUM_LENGTH_WORDS - 1 - i))) & 1023;
  });
};

export const verifyChecksum = (data: number[], customizationString: string): boolean => {
  // Result must be that added 1 that we added in mod = polymod(values) ^ 1
  return (
    polymod([
      ...customizationValues(customizationString),
      ...data, // data contains checksum already (last 3 10bits words)
    ]) === 1
  );
};
