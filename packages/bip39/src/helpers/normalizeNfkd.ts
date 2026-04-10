export const normalizeNfkd = (input: string): string => {
  return input.normalize('NFKD');
};
