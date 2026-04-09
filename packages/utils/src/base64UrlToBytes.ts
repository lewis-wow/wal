import type { Uint8Array_ } from '@repo/types';

import { base64ToBytes } from './base64ToBytes.js';

export const base64UrlToBytes = (base64Url: string): Uint8Array_ => {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

  // Restore padding if necessary
  while (base64.length % 4) {
    base64 += '=';
  }

  return base64ToBytes(base64);
};
