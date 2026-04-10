export const toBitString = (bytes: Uint8Array): string => {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
};
