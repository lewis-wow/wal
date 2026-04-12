import type { Uint8Array_ } from '@repo/types';

export type Slip39GroupConfig = {
  memberThreshold: number;
  memberCount: number;
};

export type Slip39GenerateOptions = {
  masterSecret: Uint8Array_;
  groupThreshold: number;
  groups: readonly Slip39GroupConfig[];
  passphrase?: string;
  extendable?: boolean;
  iterationExponent?: number;
  identifier?: number;
};

export type Slip39Share = {
  identifier: number;
  extendable: boolean;
  iterationExponent: number;
  groupIndex: number;
  groupThreshold: number;
  groupCount: number;
  memberIndex: number;
  memberThreshold: number;
  value: Uint8Array_;
};

export type Slip39GeneratedShare = Slip39Share & {
  mnemonic: string;
};
