import type { Uint8Array_ } from '@repo/types';

import { bytesToBase64 } from './bytesToBase64.js';

export const bytesToBase64Url = (input: Uint8Array_) => {
  return bytesToBase64(input)!.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
