import { assert } from '@repo/assert';
import { Bip32Node, HARDENED_OFFSET } from '@repo/bip32';
import { Bip44 } from './enums/Bip44.js';
import { Bip44Chain } from './enums/Bip44Chain.js';

export type Bip44PathOptions = {
  purpose?: number;
  coinType: number;
  account: number;
  chain: Bip44Chain;
  addressIndex: number;
};

export type Bip44UtxoInput = {
  txid: string;
  vout: number;
  value: bigint;
  addressIndex: number;
};

export type Bip44UtxoRecipientOutput = {
  address: string;
  value: bigint;
};

export type Bip44UtxoChangeOutput = {
  kind: 'change';
  value: bigint;
  chain: typeof Bip44Chain.Internal;
  addressIndex: number;
  path: string;
};

export type Bip44UtxoPaymentOutput = {
  kind: 'recipient';
  value: bigint;
  address: string;
};

export type Bip44UtxoComposeOptions = {
  purpose?: number;
  coinType: number;
  account: number;
  inputs: readonly Bip44UtxoInput[];
  recipients: readonly Bip44UtxoRecipientOutput[];
  fee: bigint;
  usedInternalAddressIndices?: readonly number[];
};

export type Bip44UtxoComposeResult = {
  selectedInputs: Bip44UtxoInput[];
  outputs: Array<Bip44UtxoPaymentOutput | Bip44UtxoChangeOutput>;
  changeOutput?: Bip44UtxoChangeOutput;
  totalInput: bigint;
  totalOutput: bigint;
  fee: bigint;
};

export type Bip44AccountPathOptions = {
  purpose?: number;
  coinType: number;
  account: number;
};

export type Bip44ChainPathOptions = Bip44AccountPathOptions & {
  chain: Bip44Chain;
};

export type Bip44AddressUsageContext = {
  coinType: number;
  account: number;
  chain: Bip44Chain;
  addressIndex: number;
};

export type Bip44AddressUsageChecker = (
  addressNode: Bip32Node,
  context: Bip44AddressUsageContext,
) => boolean | Promise<boolean>;

export type Bip44ScanExternalChainOptions = {
  externalChainNode: Bip32Node;
  coinType: number;
  account: number;
  gapLimit?: number;
  isAddressUsed: Bip44AddressUsageChecker;
};

export type Bip44ExternalChainScanResult = {
  hasTransactions: boolean;
  usedAddressIndices: number[];
  firstUnusedAddressIndex: number;
  scannedAddressCount: number;
};

export type Bip44AccountDiscoveryOptions = {
  masterNode: Bip32Node;
  purpose?: number;
  coinType: number;
  gapLimit?: number;
  maxAccounts?: number;
  isAddressUsed: Bip44AddressUsageChecker;
};

export type Bip44DiscoveredAccount = {
  account: number;
  accountNode: Bip32Node;
  externalChainNode: Bip32Node;
  usedAddressIndices: number[];
  firstUnusedAddressIndex: number;
};

const assertUint31 = (value: number, fieldName: string): void => {
  assert(Number.isInteger(value), `${fieldName} must be an integer`);
  assert(value >= 0 && value < HARDENED_OFFSET, `${fieldName} must be in range 0..2^31-1`);
};

const assertChain = (chain: number): void => {
  assert(chain === Bip44Chain.External || chain === Bip44Chain.Internal, 'Chain must be 0 (external) or 1 (internal)');
};

const assertGapLimit = (gapLimit: number): void => {
  assert(Number.isInteger(gapLimit) && gapLimit > 0, 'Gap limit must be a positive integer');
};

const getPurpose = (purpose?: number): number => {
  const value = purpose ?? Bip44.Purpose;
  assertUint31(value, 'Purpose');
  return value;
};

const assertAmount = (value: bigint, fieldName: string): void => {
  assert(value >= 0n, `${fieldName} must be >= 0`);
};

const nextChangeAddressIndex = (usedInternalAddressIndices: readonly number[] = []): number => {
  if (usedInternalAddressIndices.length === 0) {
    return 0;
  }

  let maxUsed = -1;

  for (const index of usedInternalAddressIndices) {
    assertUint31(index, 'Used internal address index');
    if (index > maxUsed) {
      maxUsed = index;
    }
  }

  return maxUsed + 1;
};

export const getBip44AccountPath = (opts: Bip44AccountPathOptions): string => {
  const purpose = getPurpose(opts.purpose);

  assertUint31(opts.coinType, 'Coin type');
  assertUint31(opts.account, 'Account');

  return `m/${purpose}'/${opts.coinType}'/${opts.account}'`;
};

export const getBip44ChainPath = (opts: Bip44ChainPathOptions): string => {
  assertChain(opts.chain);
  return `${getBip44AccountPath(opts)}/${opts.chain}`;
};

export const getBip44AddressPath = (opts: Bip44PathOptions): string => {
  assertUint31(opts.addressIndex, 'Address index');
  return `${getBip44ChainPath(opts)}/${opts.addressIndex}`;
};

export const deriveBip44AccountNode = (masterNode: Bip32Node, opts: Bip44AccountPathOptions): Bip32Node => {
  return masterNode.derivePath(getBip44AccountPath(opts));
};

export const deriveBip44ChainNode = (accountNode: Bip32Node, chain: Bip44Chain): Bip32Node => {
  assertChain(chain);
  return accountNode.derive(chain);
};

export const deriveBip44AddressNode = (chainNode: Bip32Node, addressIndex: number): Bip32Node => {
  assertUint31(addressIndex, 'Address index');
  return chainNode.derive(addressIndex);
};

export const deriveBip44AddressNodeFromMaster = (masterNode: Bip32Node, opts: Bip44PathOptions): Bip32Node => {
  return masterNode.derivePath(getBip44AddressPath(opts));
};

export const composeBip44UtxoTransaction = (opts: Bip44UtxoComposeOptions): Bip44UtxoComposeResult => {
  assert(opts.inputs.length > 0, 'At least one input is required');
  assert(opts.recipients.length > 0, 'At least one recipient output is required');

  assertUint31(opts.coinType, 'Coin type');
  assertUint31(opts.account, 'Account');
  assertAmount(opts.fee, 'Fee');

  const recipients: Bip44UtxoPaymentOutput[] = opts.recipients.map((recipient) => {
    assert(recipient.address.length > 0, 'Recipient address must not be empty');
    assertAmount(recipient.value, 'Recipient value');

    return {
      kind: 'recipient',
      address: recipient.address,
      value: recipient.value,
    };
  });

  const requiredAmount = recipients.reduce((sum, output) => sum + output.value, 0n) + opts.fee;

  const selectedInputs: Bip44UtxoInput[] = [];
  let totalInput = 0n;

  for (const input of opts.inputs) {
    assert(input.txid.length > 0, 'Input txid must not be empty');
    assert(Number.isInteger(input.vout) && input.vout >= 0, 'Input vout must be a non-negative integer');
    assertAmount(input.value, 'Input value');
    assertUint31(input.addressIndex, 'Input address index');

    selectedInputs.push(input);
    totalInput += input.value;

    if (totalInput >= requiredAmount) {
      break;
    }
  }

  assert(totalInput >= requiredAmount, 'Insufficient funds for requested outputs and fee');

  const changeValue = totalInput - requiredAmount;
  const outputs: Array<Bip44UtxoPaymentOutput | Bip44UtxoChangeOutput> = [...recipients];

  let changeOutput: Bip44UtxoChangeOutput | undefined;

  if (changeValue > 0n) {
    const changeAddressIndex = nextChangeAddressIndex(opts.usedInternalAddressIndices);

    changeOutput = {
      kind: 'change',
      value: changeValue,
      chain: Bip44Chain.Internal,
      addressIndex: changeAddressIndex,
      path: getBip44AddressPath({
        purpose: opts.purpose,
        coinType: opts.coinType,
        account: opts.account,
        chain: Bip44Chain.Internal,
        addressIndex: changeAddressIndex,
      }),
    };

    outputs.push(changeOutput);
  }

  return {
    selectedInputs,
    outputs,
    changeOutput,
    totalInput,
    totalOutput: requiredAmount,
    fee: opts.fee,
  };
};

export const scanBip44ExternalChain = async (
  opts: Bip44ScanExternalChainOptions,
): Promise<Bip44ExternalChainScanResult> => {
  const gapLimit = opts.gapLimit ?? Bip44.AddressGapLimit;
  assertGapLimit(gapLimit);

  let addressIndex = 0;
  let unusedInRow = 0;
  const usedAddressIndices: number[] = [];

  while (unusedInRow < gapLimit) {
    const addressNode = deriveBip44AddressNode(opts.externalChainNode, addressIndex);
    const isUsed = await opts.isAddressUsed(addressNode, {
      coinType: opts.coinType,
      account: opts.account,
      chain: Bip44Chain.External,
      addressIndex,
    });

    if (isUsed) {
      usedAddressIndices.push(addressIndex);
      unusedInRow = 0;
    } else {
      unusedInRow += 1;
    }

    addressIndex += 1;
  }

  return {
    hasTransactions: usedAddressIndices.length > 0,
    usedAddressIndices,
    firstUnusedAddressIndex: addressIndex - gapLimit,
    scannedAddressCount: addressIndex,
  };
};

export const discoverBip44Accounts = async (opts: Bip44AccountDiscoveryOptions): Promise<Bip44DiscoveredAccount[]> => {
  const gapLimit = opts.gapLimit ?? Bip44.AddressGapLimit;
  const maxAccounts = opts.maxAccounts ?? 1000;

  assertGapLimit(gapLimit);
  assert(Number.isInteger(maxAccounts) && maxAccounts > 0, 'maxAccounts must be a positive integer');

  const accounts: Bip44DiscoveredAccount[] = [];

  for (let account = 0; account < maxAccounts; account += 1) {
    const accountNode = deriveBip44AccountNode(opts.masterNode, {
      purpose: opts.purpose,
      coinType: opts.coinType,
      account,
    });

    const externalChainNode = deriveBip44ChainNode(accountNode, Bip44Chain.External);
    const scan = await scanBip44ExternalChain({
      externalChainNode,
      coinType: opts.coinType,
      account,
      gapLimit,
      isAddressUsed: opts.isAddressUsed,
    });

    if (!scan.hasTransactions) {
      break;
    }

    accounts.push({
      account,
      accountNode,
      externalChainNode,
      usedAddressIndices: scan.usedAddressIndices,
      firstUnusedAddressIndex: scan.firstUnusedAddressIndex,
    });
  }

  return accounts;
};

export const isBip44GapLimitExceeded = (
  lastUsedAddressIndex: number,
  nextAddressIndex: number,
  gapLimit = Bip44.AddressGapLimit,
): boolean => {
  assert(Number.isInteger(lastUsedAddressIndex) && lastUsedAddressIndex >= -1, 'lastUsedAddressIndex must be >= -1');
  assertUint31(nextAddressIndex, 'Next address index');
  assertGapLimit(gapLimit);

  return nextAddressIndex - lastUsedAddressIndex > gapLimit;
};
