import { Uint8Array_ } from '@repo/types';

export const bytesEqual = (a: Uint8Array_, b: Uint8Array_): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
};
