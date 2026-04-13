import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { Asset, Network, Token } from './wallet-context';

type WalletSharedState = {
  assets: Asset[];
  selectedAssetId: string | null;
  selectedNetworkId: string | null;
  selectedTokenId: string | null;
  receiveAddress?: string;
  activeNetworkSupportsRuntime: boolean;
};

type SyncWalletPayload = {
  assets: Asset[];
  receiveAddress?: string;
  activeNetworkSupportsRuntime: boolean;
  preferredAssetId?: string;
  preferredNetworkId?: string;
  preferredTokenId?: string;
};

const EMPTY_TOKEN: Token = {
  id: 'empty-token',
  symbol: '--',
  name: 'No token selected',
  balance: '0',
  value: '0 --',
  change: '0.0%',
  positive: true,
};

const EMPTY_NETWORK: Network = {
  id: 'empty-network',
  name: 'No network selected',
  chainId: 0,
  rpcUrl: '',
  nativeSymbol: '--',
  isTestnet: true,
  kind: 'predefined',
  tokens: [EMPTY_TOKEN],
};

const EMPTY_ASSET: Asset = {
  id: 'empty-asset',
  symbol: '--',
  name: 'No asset selected',
  icon: '?',
  networks: [],
};

const initialState: WalletSharedState = {
  assets: [],
  selectedAssetId: null,
  selectedNetworkId: null,
  selectedTokenId: null,
  receiveAddress: undefined,
  activeNetworkSupportsRuntime: false,
};

const findAsset = (assets: readonly Asset[], id: string | null | undefined): Asset | undefined => {
  if (!id) {
    return undefined;
  }

  return assets.find((asset) => asset.id === id);
};

const findNetwork = (asset: Asset | undefined, id: string | null | undefined): Network | undefined => {
  if (!asset || !id) {
    return undefined;
  }

  return asset.networks.find((network) => network.id === id);
};

const findToken = (network: Network | undefined, id: string | null | undefined): Token | undefined => {
  if (!network || !id) {
    return undefined;
  }

  return network.tokens.find((token) => token.id === id);
};

const ensureValidSelection = (
  state: WalletSharedState,
  preferred: {
    assetId?: string;
    networkId?: string;
    tokenId?: string;
  } = {},
): void => {
  const asset =
    findAsset(state.assets, preferred.assetId) ?? findAsset(state.assets, state.selectedAssetId) ?? state.assets[0];

  state.selectedAssetId = asset?.id ?? null;

  const network =
    findNetwork(asset, preferred.networkId) ?? findNetwork(asset, state.selectedNetworkId) ?? asset?.networks[0];

  state.selectedNetworkId = network?.id ?? null;

  const token =
    findToken(network, preferred.tokenId) ?? findToken(network, state.selectedTokenId) ?? network?.tokens[0];

  state.selectedTokenId = token?.id ?? null;
};

const walletSlice = createSlice({
  name: 'walletShared',
  initialState,
  reducers: {
    syncWalletState: (state, action: PayloadAction<SyncWalletPayload>) => {
      state.assets = action.payload.assets;
      state.receiveAddress = action.payload.receiveAddress;
      state.activeNetworkSupportsRuntime = action.payload.activeNetworkSupportsRuntime;

      ensureValidSelection(state, {
        assetId: action.payload.preferredAssetId,
        networkId: action.payload.preferredNetworkId,
        tokenId: action.payload.preferredTokenId,
      });
    },
    selectAsset: (state, action: PayloadAction<string>) => {
      state.selectedAssetId = action.payload;
      state.selectedNetworkId = null;
      state.selectedTokenId = null;
      ensureValidSelection(state, { assetId: action.payload });
    },
    selectNetwork: (state, action: PayloadAction<string>) => {
      state.selectedNetworkId = action.payload;
      state.selectedTokenId = null;
      ensureValidSelection(state, { networkId: action.payload });
    },
    selectToken: (state, action: PayloadAction<string>) => {
      state.selectedTokenId = action.payload;
      ensureValidSelection(state, { tokenId: action.payload });
    },
  },
});

export const { syncWalletState, selectAsset, selectNetwork, selectToken } = walletSlice.actions;

export const walletStore = configureStore({
  reducer: {
    wallet: walletSlice.reducer,
  },
});

export type RootState = ReturnType<typeof walletStore.getState>;
export type AppDispatch = typeof walletStore.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

const selectWalletSlice = (state: RootState): WalletSharedState => state.wallet;

export const selectAssets = (state: RootState): Asset[] => selectWalletSlice(state).assets;

export const selectSelectedAsset = (state: RootState): Asset => {
  const walletState = selectWalletSlice(state);
  return findAsset(walletState.assets, walletState.selectedAssetId) ?? walletState.assets[0] ?? EMPTY_ASSET;
};

export const selectSelectedNetwork = (state: RootState): Network => {
  const walletState = selectWalletSlice(state);
  const selectedAsset = selectSelectedAsset(state);

  return findNetwork(selectedAsset, walletState.selectedNetworkId) ?? selectedAsset.networks[0] ?? EMPTY_NETWORK;
};

export const selectSelectedToken = (state: RootState): Token => {
  const walletState = selectWalletSlice(state);
  const selectedNetwork = selectSelectedNetwork(state);

  return findToken(selectedNetwork, walletState.selectedTokenId) ?? selectedNetwork.tokens[0] ?? EMPTY_TOKEN;
};

export const selectReceiveAddress = (state: RootState): string | undefined => {
  return selectWalletSlice(state).receiveAddress;
};

export const selectActiveNetworkSupportsRuntime = (state: RootState): boolean => {
  return selectWalletSlice(state).activeNetworkSupportsRuntime;
};

export const useWallet = () => {
  const dispatch = useAppDispatch();

  const assets = useAppSelector(selectAssets);
  const selectedAsset = useAppSelector(selectSelectedAsset);
  const selectedNetwork = useAppSelector(selectSelectedNetwork);
  const selectedToken = useAppSelector(selectSelectedToken);
  const receiveAddress = useAppSelector(selectReceiveAddress);
  const activeNetworkSupportsRuntime = useAppSelector(selectActiveNetworkSupportsRuntime);

  return {
    assets,
    selectedAsset,
    selectedNetwork,
    selectedToken,
    receiveAddress,
    activeNetworkSupportsRuntime,
    setSelectedAsset: (asset: Asset) => dispatch(selectAsset(asset.id)),
    setSelectedNetwork: (network: Network) => dispatch(selectNetwork(network.id)),
    setSelectedToken: (token: Token) => dispatch(selectToken(token.id)),
  };
};
