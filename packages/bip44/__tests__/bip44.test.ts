import { describe, expect, test } from 'vitest';

import { Bip32Node } from '@repo/bip32';
import {
  Bip44,
  Bip44Chain,
  Bip44CoinType,
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
});
