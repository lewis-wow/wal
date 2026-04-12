import { describe, expect, test } from 'vitest';

import { Bip32Node } from '@repo/bip32';
import {
  Bip44,
  Bip44Chain,
  Bip44CoinType,
  composeBip44UtxoTransaction,
  deriveBip44AccountNode,
  deriveBip44AddressNodeFromMaster,
  discoverBip44Accounts,
  getBip44AddressPath,
  isBip44GapLimitExceeded,
  scanBip44ExternalChain,
} from '../src/index.js';
import { hexToBytes } from '@repo/utils';

describe('BIP44', () => {
  test('builds canonical paths from the specification examples', () => {
    expect(
      getBip44AddressPath({
        coinType: Bip44CoinType.Bitcoin,
        account: 0,
        chain: Bip44Chain.External,
        addressIndex: 0,
      }),
    ).toBe("m/44'/0'/0'/0/0");

    expect(
      getBip44AddressPath({
        coinType: Bip44CoinType.BitcoinTestnet,
        account: 1,
        chain: Bip44Chain.Internal,
        addressIndex: 1,
      }),
    ).toBe("m/44'/1'/1'/1/1");
  });

  test('derives the same node as direct BIP32 derivation', () => {
    const master = Bip32Node.fromSeed({ seed: hexToBytes('000102030405060708090a0b0c0d0e0f') });

    const viaBip44 = deriveBip44AddressNodeFromMaster(master, {
      coinType: Bip44CoinType.Bitcoin,
      account: 0,
      chain: Bip44Chain.External,
      addressIndex: 0,
    });

    const viaPath = master.derivePath("m/44'/0'/0'/0/0");

    expect(viaBip44.toXpub()).toBe(viaPath.toXpub());
    expect(viaBip44.toXprv()).toBe(viaPath.toXprv());
  });

  test('scans external chain until reaching gap limit', async () => {
    const master = Bip32Node.fromSeed({ seed: hexToBytes('000102030405060708090a0b0c0d0e0f') });
    const accountNode = deriveBip44AccountNode(master, {
      coinType: Bip44CoinType.Bitcoin,
      account: 0,
    });
    const externalChainNode = accountNode.derive(Bip44Chain.External);

    const used = new Set<number>([0, 3]);

    const result = await scanBip44ExternalChain({
      externalChainNode,
      coinType: Bip44CoinType.Bitcoin,
      account: 0,
      gapLimit: 3,
      isAddressUsed: (_addressNode, context) => used.has(context.addressIndex),
    });

    expect(result.hasTransactions).toBe(true);
    expect(result.usedAddressIndices).toEqual([0, 3]);
    expect(result.scannedAddressCount).toBe(7);
    expect(result.firstUnusedAddressIndex).toBe(4);
  });

  test('discovers accounts and stops at first account with no external history', async () => {
    const master = Bip32Node.fromSeed({ seed: hexToBytes('000102030405060708090a0b0c0d0e0f') });

    const usedByAccount = new Map<number, Set<number>>([
      [0, new Set([0, 2])],
      [1, new Set([1])],
      [2, new Set()],
    ]);

    const accounts = await discoverBip44Accounts({
      masterNode: master,
      coinType: Bip44CoinType.Bitcoin,
      gapLimit: 3,
      isAddressUsed: (_addressNode, context) => usedByAccount.get(context.account)?.has(context.addressIndex) ?? false,
    });

    expect(accounts.map((account) => account.account)).toEqual([0, 1]);
    expect(accounts[0]?.usedAddressIndices).toEqual([0, 2]);
    expect(accounts[1]?.usedAddressIndices).toEqual([1]);
  });

  test('checks gap limit when requesting a new address', () => {
    expect(isBip44GapLimitExceeded(-1, Bip44.AddressGapLimit - 1)).toBe(false);
    expect(isBip44GapLimitExceeded(-1, Bip44.AddressGapLimit)).toBe(true);
    expect(isBip44GapLimitExceeded(10, 30)).toBe(false);
    expect(isBip44GapLimitExceeded(10, 31)).toBe(true);
  });

  test('composes UTXO outputs with change on internal chain', () => {
    const result = composeBip44UtxoTransaction({
      coinType: Bip44CoinType.Bitcoin,
      account: 0,
      inputs: [
        { txid: 'tx1', vout: 0, value: 45_000n, addressIndex: 0 },
        { txid: 'tx2', vout: 1, value: 35_000n, addressIndex: 3 },
      ],
      recipients: [{ address: 'bc1qrecipient', value: 50_000n }],
      fee: 5_000n,
    });

    expect(result.selectedInputs).toHaveLength(2);
    expect(result.totalInput).toBe(80_000n);
    expect(result.totalOutput).toBe(55_000n);
    expect(result.changeOutput).toEqual({
      kind: 'change',
      value: 25_000n,
      chain: Bip44Chain.Internal,
      addressIndex: 0,
      path: "m/44'/0'/0'/1/0",
    });
  });

  test('derives next internal change address index from previous usage', () => {
    const result = composeBip44UtxoTransaction({
      coinType: Bip44CoinType.Bitcoin,
      account: 2,
      inputs: [{ txid: 'tx1', vout: 0, value: 100_000n, addressIndex: 1 }],
      recipients: [{ address: 'bc1qrecipient2', value: 40_000n }],
      fee: 1_000n,
      usedInternalAddressIndices: [0, 2, 7],
    });

    expect(result.changeOutput?.addressIndex).toBe(8);
    expect(result.changeOutput?.path).toBe("m/44'/0'/2'/1/8");
  });

  test('omits change output when spend is exact', () => {
    const result = composeBip44UtxoTransaction({
      coinType: Bip44CoinType.Bitcoin,
      account: 0,
      inputs: [{ txid: 'tx1', vout: 0, value: 21_000n, addressIndex: 0 }],
      recipients: [{ address: 'bc1qrecipient3', value: 20_000n }],
      fee: 1_000n,
    });

    expect(result.changeOutput).toBeUndefined();
    expect(result.outputs).toHaveLength(1);
  });

  test('throws when there are insufficient funds for spend and fee', () => {
    expect(() =>
      composeBip44UtxoTransaction({
        coinType: Bip44CoinType.Bitcoin,
        account: 0,
        inputs: [{ txid: 'tx1', vout: 0, value: 10_000n, addressIndex: 0 }],
        recipients: [{ address: 'bc1qrecipient4', value: 10_000n }],
        fee: 100n,
      }),
    ).toThrow('Insufficient funds for requested outputs and fee');
  });
});
