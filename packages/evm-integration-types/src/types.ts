import type { Address, Chain, Hex, PublicClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

export type EvmTransferRequest = {
  privateKey: Hex;
  to: Address;
  value: bigint;
};

export interface EvmIntegrationContract {
  readonly name: string;
  readonly chain: Chain;
  readonly chainId: number;

  createAccount(privateKey: Hex): PrivateKeyAccount;

  getBlockNumber(): Promise<bigint>;
  getNativeBalance(address: Address): Promise<bigint>;
  transferNative(request: EvmTransferRequest): Promise<Hex>;
  waitForTransaction(hash: Hex): ReturnType<PublicClient['waitForTransactionReceipt']>;

  getExplorerTxUrl(hash: Hex): string | undefined;
}
