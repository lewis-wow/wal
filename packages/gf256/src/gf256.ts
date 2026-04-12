const EXP_TABLE = new Uint8Array(255);
const LOG_TABLE = new Uint8Array(256);

const precomputeTables = (): void => {
  let poly = 1;

  for (let i = 0; i < 255; i += 1) {
    EXP_TABLE[i] = poly;
    LOG_TABLE[poly] = i;

    // Multiply by (x + 1) and reduce by x^8 + x^4 + x^3 + x + 1.
    poly = (poly << 1) ^ poly;
    if ((poly & 0x100) !== 0) {
      poly ^= 0x11b;
    }
  }
};

precomputeTables();

const assertByte = (value: number, fieldName: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${fieldName} must be an integer in range 0..255`);
  }
};

export const gf256Add = (left: number, right: number): number => {
  assertByte(left, 'left');
  assertByte(right, 'right');
  return left ^ right;
};

export const gf256Sub = gf256Add;

export const gf256Mul = (left: number, right: number): number => {
  assertByte(left, 'left');
  assertByte(right, 'right');

  if (left === 0 || right === 0) {
    return 0;
  }

  return EXP_TABLE[(LOG_TABLE[left]! + LOG_TABLE[right]!) % 0xff]!;
};

export const gf256Div = (numerator: number, denominator: number): number => {
  assertByte(numerator, 'numerator');
  assertByte(denominator, 'denominator');

  if (numerator === 0) {
    return 0;
  }

  if (denominator === 0) {
    throw new Error('Cannot divide by zero in GF(256)');
  }

  let logDiff = (LOG_TABLE[numerator]! - LOG_TABLE[denominator]!) % 0xff;
  if (logDiff < 0) {
    logDiff += 0xff;
  }

  return EXP_TABLE[logDiff]!;
};

export const gf256Inv = (value: number): number => {
  assertByte(value, 'value');

  if (value === 0) {
    throw new Error('Cannot invert zero in GF(256)');
  }

  return EXP_TABLE[(0xff - LOG_TABLE[value]!) % 0xff]!;
};
