import { assert } from '@repo/assert';

import { UINT32_MAX } from './uint32ToBytes.js';

// 2^31
export const HARDENED_OFFSET = 0x80000000;

export const isHardenedIndex = (index: number): boolean => {
  assert(Number.isInteger(index) && index >= 0 && index <= UINT32_MAX, 'Index must be a uint32');
  return index >= HARDENED_OFFSET;
};

export const toHardenedIndex = (index: number): number => {
  assert(Number.isInteger(index) && index >= 0 && index < HARDENED_OFFSET, 'Index must be in range 0..2^31-1');
  return index + HARDENED_OFFSET;
};

export const fromHardenedIndex = (index: number): number => {
  assert(isHardenedIndex(index), 'Index is not a hardened index');
  return index - HARDENED_OFFSET;
};
