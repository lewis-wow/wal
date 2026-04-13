import { describe, expect, test } from 'vitest';

import { SepoliaIntegration } from '../src/index.js';

describe('SepoliaIntegration', () => {
  test('exposes stable integration metadata contract', () => {
    const integration = new SepoliaIntegration();

    expect(integration.name).toBe('Ethereum Sepolia');
    expect(integration.chainId).toBe(11155111);
    expect(integration.chain.name.toLowerCase()).toContain('sepolia');
  });

  test('creates deterministic explorer tx urls', () => {
    const integration = new SepoliaIntegration();
    const hash = `0x${'11'.repeat(32)}` as `0x${string}`;

    expect(integration.getExplorerTxUrl(hash)).toBe(`https://sepolia.etherscan.io/tx/${hash}`);
  });

  test('creates wallet client for the configured chain', () => {
    const integration = new SepoliaIntegration();
    const privateKey = `0x${'11'.repeat(32)}` as `0x${string}`;

    const walletClient = integration.createWalletClient(privateKey);

    expect(walletClient.chain?.id).toBe(11155111);
    expect(walletClient.account?.address).toMatch(/^0x[a-fA-F0-9]{40}$/u);
  });
});
