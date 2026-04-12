import { describe, expect, test } from 'vitest';

import { gf256Add, gf256Div, gf256Inv, gf256Mul, gf256Sub } from '../src/index.js';

describe('gf256', () => {
  test('add/sub are XOR', () => {
    expect(gf256Add(0x57, 0x83)).toBe(0xd4);
    expect(gf256Sub(0x57, 0x83)).toBe(0xd4);
  });

  test('mul matches known AES/GF(256) example', () => {
    expect(gf256Mul(0x57, 0x83)).toBe(0xc1);
  });

  test('div is inverse of mul', () => {
    expect(gf256Div(0xc1, 0x57)).toBe(0x83);
    expect(gf256Div(0xc1, 0x83)).toBe(0x57);
  });

  test('inverse produces multiplicative identity', () => {
    for (const value of [1, 2, 3, 5, 11, 0x57, 0x83, 255]) {
      expect(gf256Mul(value, gf256Inv(value))).toBe(1);
    }
  });
});
