import { assert } from '@repo/assert';

export const parsePathIndex = (segment: string, hardenedOffset: number): number => {
  assert(segment.length > 0, 'Invalid empty derivation path segment');

  const isHardened = segment.endsWith("'") || segment.endsWith('h') || segment.endsWith('H');
  const raw = isHardened ? segment.slice(0, -1) : segment;

  assert(/^\d+$/u.test(raw), `Invalid derivation index: ${segment}`);

  const index = Number.parseInt(raw, 10);
  assert(Number.isSafeInteger(index), `Derivation index out of range: ${segment}`);
  assert(index >= 0 && index < hardenedOffset, 'Derivation index must be between 0 and 2^31-1');

  if (isHardened) {
    return index + hardenedOffset;
  }

  return index;
};
