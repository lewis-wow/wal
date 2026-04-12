export const bytesXor = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  if (left.length !== right.length) {
    throw new Error('Byte arrays must have matching lengths for XOR');
  }

  const output = new Uint8Array(left.length);
  for (let i = 0; i < output.length; i += 1) {
    output[i] = left[i]! ^ right[i]!;
  }

  return output;
};
