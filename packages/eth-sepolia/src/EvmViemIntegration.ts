import { createPublicClient, createWalletClient, type Address, type Chain, type Hex, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { EvmIntegrationContract, EvmTransferRequest } from '@repo/evm-integration-types';

export type EvmViemIntegrationOptions = {
  rpcUrl?: string;
};

type EvmViemIntegrationConfig = EvmViemIntegrationOptions & {
  chain: Chain;
  name: string;
};

export class EvmViemIntegration implements EvmIntegrationContract {
  public readonly name: string;
  public readonly chain: Chain;
  public readonly chainId: number;
  protected readonly rpcUrl?: string;
  protected readonly publicClient: ReturnType<typeof createPublicClient>;

  public constructor(config: EvmViemIntegrationConfig) {
    this.name = config.name;
    this.chain = config.chain;
    this.chainId = config.chain.id;
    this.rpcUrl = config.rpcUrl;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  public createAccount(privateKey: Hex) {
    return privateKeyToAccount(privateKey);
  }

  public createWalletClient(privateKey: Hex): ReturnType<typeof createWalletClient> {
    return createWalletClient({
      account: this.createAccount(privateKey),
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  public async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  public async getNativeBalance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  public async transferNative(request: EvmTransferRequest): Promise<Hex> {
    const account = this.createAccount(request.privateKey);
    const walletClient = this.createWalletClient(request.privateKey);

    return walletClient.sendTransaction({
      account,
      to: request.to,
      value: request.value,
      chain: this.chain,
    });
  }

  public async waitForTransaction(
    hash: Hex,
  ): Promise<Awaited<ReturnType<ReturnType<typeof createPublicClient>['waitForTransactionReceipt']>>> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  public getExplorerTxUrl(hash: Hex): string | undefined {
    const explorerBaseUrl = this.chain.blockExplorers?.default.url;

    if (!explorerBaseUrl) {
      return undefined;
    }

    return `${explorerBaseUrl}/tx/${hash}`;
  }
}
