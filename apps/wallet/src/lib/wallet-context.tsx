export type Token = {
  id: string;
  symbol: string;
  name: string;
  balance: string;
  value: string;
  change: string;
  positive: boolean;
  contractAddress?: string;
};

export type Network = {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeSymbol: string;
  isTestnet: boolean;
  kind: 'predefined' | 'custom';
  tokens: Token[];
};

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
  networks: Network[];
};

export type AddCustomNetworkInput = {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeSymbol: string;
};
