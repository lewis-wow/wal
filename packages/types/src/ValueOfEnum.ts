export type ValueOfEnum<T extends Record<string, unknown>> = T[keyof T];
