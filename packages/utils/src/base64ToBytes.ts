import type { Uint8Array_ } from '@repo/types';

export const base64ToBytes = (base64: string): Uint8Array_ => {
  const binString = atob(base64),
    bytes = Uint8Array.from(binString, (char) => char.charCodeAt(0));

  return bytes;
};
