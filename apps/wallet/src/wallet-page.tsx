import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { masterFromSeed } from '@repo/bip32';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@repo/bip39';
import { Bip44Chain, Bip44CoinType, deriveBip44AddressNodeFromMaster, getBip44AddressPath } from '@repo/bip44';
import { SepoliaIntegration } from '@repo/eth-sepolia';
import type { Uint8Array_ } from '@repo/types';
import { Button } from '@repo/ui/components/ui/button';
import { bytesToHex } from '@repo/utils';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Address, Hex } from 'viem';
import { formatEther, isAddress, parseEther } from 'viem';
import { z } from 'zod';

import { AssetSwitcher } from './components/wallet/asset-switcher';
import { ReceiveDialog } from './components/wallet/receive-dialog';
import { ScanDialog } from './components/wallet/scan-dialog';
import { SendDialog } from './components/wallet/send-dialog';
import { TransactionHistory } from './components/wallet/transaction-history';
import { WalletActions } from './components/wallet/wallet-actions';
import { WalletBalance } from './components/wallet/wallet-balance';
import { WalletHeader } from './components/wallet/wallet-header';
import type { AddCustomNetworkInput, Token } from './lib/wallet-context';
import {
  selectNetwork,
  selectSelectedNetwork,
  syncWalletState,
  useAppDispatch,
  useAppSelector,
} from './lib/wallet-store';
import { decryptSeedFromVault, hasSeedVault, setupSeedVault } from './lib/webauthn-prf-vault';

const DEFAULT_BIP39_PASSPHRASE = '';
const DEFAULT_DERIVATION_ACCOUNT = 0;
const DEFAULT_ADDRESS_CHAIN = Bip44Chain.External;
const MAX_DISCOVERY_SCAN = 10;
const PUBLIC_PRIMARY_ADDRESS_KEY = 'wallet-primary-address-v1';
const NETWORKS_STORAGE_KEY = 'wallet-evm-networks-v1';
const ACTIVE_NETWORK_STORAGE_KEY = 'wallet-active-network-v1';
const DEFAULT_SUPPORTED_NETWORK_ID = 'eth-sepolia';
const SETUP_STEPS = ['Seed', 'Security', 'Review'] as const;
const PRINTABLE_ASCII_REGEX = /^[\x20-\x7E]*$/u;

const sepolia = new SepoliaIntegration();

type SetupStep = 1 | 2 | 3;

type WalletPageProps = {
  wizardStep?: SetupStep;
};

type WalletAddress = {
  path: string;
  address: Address;
  addressIndex: number;
  balance: bigint;
};

type LatestTransaction = {
  hash: Hex;
  explorerUrl?: string;
  from: Address;
  to: Address;
  amountEth: string;
  status: string;
};

type StoredNetwork = {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeSymbol: string;
  kind: 'predefined' | 'custom';
};

const DEFAULT_PREDEFINED_NETWORK: StoredNetwork = {
  id: DEFAULT_SUPPORTED_NETWORK_ID,
  name: 'Ethereum Sepolia Testnet',
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.org',
  nativeSymbol: 'SEP',
  kind: 'predefined',
};

const PREDEFINED_NETWORKS: StoredNetwork[] = [DEFAULT_PREDEFINED_NETWORK];

const MAINNET_CHAIN_IDS = new Set([1, 10, 56, 137, 8453, 42161]);

const normalizeMnemonic = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .join(' ');
};

const trimDecimals = (value: string, decimals = 4): string => {
  const [intPart, decimalPart] = value.split('.');
  if (!decimalPart) {
    return value;
  }

  return `${intPart}.${decimalPart.slice(0, decimals)}`;
};

const readCachedPrimaryAddress = (): Address | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const value = window.localStorage.getItem(PUBLIC_PRIMARY_ADDRESS_KEY);
  if (!value || !isAddress(value)) {
    return undefined;
  }

  return value as Address;
};

const writeCachedPrimaryAddress = (address: Address): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PUBLIC_PRIMARY_ADDRESS_KEY, address);
};

const readStoredNetworks = (): StoredNetwork[] => {
  if (typeof window === 'undefined') {
    return PREDEFINED_NETWORKS;
  }

  const rawValue = window.localStorage.getItem(NETWORKS_STORAGE_KEY);
  if (!rawValue) {
    return PREDEFINED_NETWORKS;
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredNetwork[];
    const merged = [...PREDEFINED_NETWORKS];

    for (const network of parsed) {
      if (
        typeof network.id !== 'string' ||
        typeof network.name !== 'string' ||
        typeof network.chainId !== 'number' ||
        typeof network.rpcUrl !== 'string' ||
        typeof network.nativeSymbol !== 'string' ||
        (network.kind !== 'predefined' && network.kind !== 'custom')
      ) {
        continue;
      }

      if (PREDEFINED_NETWORKS.some((row) => row.id === network.id)) {
        continue;
      }

      merged.push({
        ...network,
        kind: 'custom',
      });
    }

    return merged;
  } catch {
    return PREDEFINED_NETWORKS;
  }
};

const writeStoredNetworks = (networks: readonly StoredNetwork[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(NETWORKS_STORAGE_KEY, JSON.stringify(networks));
};

const readStoredActiveNetwork = (): string => {
  if (typeof window === 'undefined') {
    return DEFAULT_SUPPORTED_NETWORK_ID;
  }

  return window.localStorage.getItem(ACTIVE_NETWORK_STORAGE_KEY) ?? DEFAULT_SUPPORTED_NETWORK_ID;
};

const writeStoredActiveNetwork = (networkId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACTIVE_NETWORK_STORAGE_KEY, networkId);
};

const setupFormSchema = z
  .object({
    seedMode: z.enum(['create', 'import']),
    mnemonic: z.string(),
    bip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
  })
  .superRefine((value, ctx) => {
    if (value.seedMode === 'import' && !validateMnemonic(normalizeMnemonic(value.mnemonic))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mnemonic'],
        message: 'Enter a valid BIP39 mnemonic.',
      });
    }
  });

type SetupFormValues = z.infer<typeof setupFormSchema>;

const sendFormSchema = z.object({
  to: z
    .string()
    .trim()
    .refine((value) => isAddress(value), 'Enter a valid EVM address.'),
  amountEth: z
    .string()
    .trim()
    .min(1, 'Amount is required.')
    .refine((value) => {
      try {
        return parseEther(value) > 0n;
      } catch {
        return false;
      }
    }, 'Enter a valid amount greater than 0.'),
});

const deriveAddressAtIndex = (seed: Uint8Array_, addressIndex: number): WalletAddress => {
  const masterNode = masterFromSeed({ seed });
  const path = getBip44AddressPath({
    coinType: Bip44CoinType.Ether,
    account: DEFAULT_DERIVATION_ACCOUNT,
    chain: DEFAULT_ADDRESS_CHAIN,
    addressIndex,
  });
  const addressNode = deriveBip44AddressNodeFromMaster(masterNode, {
    coinType: Bip44CoinType.Ether,
    account: DEFAULT_DERIVATION_ACCOUNT,
    chain: DEFAULT_ADDRESS_CHAIN,
    addressIndex,
  });

  if (!addressNode.privateKey) {
    throw new Error('Expected private key for derived address node.');
  }

  const account = sepolia.createAccount(`0x${bytesToHex(addressNode.privateKey)}` as Hex);

  return {
    path,
    address: account.address,
    addressIndex,
    balance: 0n,
  };
};

const derivePrivateKeyAtIndex = (seed: Uint8Array_, addressIndex: number): Hex => {
  const addressNode = deriveBip44AddressNodeFromMaster(masterFromSeed({ seed }), {
    coinType: Bip44CoinType.Ether,
    account: DEFAULT_DERIVATION_ACCOUNT,
    chain: DEFAULT_ADDRESS_CHAIN,
    addressIndex,
  });

  if (!addressNode.privateKey) {
    throw new Error('Expected private key for derived address node.');
  }

  return `0x${bytesToHex(addressNode.privateKey)}` as Hex;
};

const discoverSepoliaAddresses = async (seed: Uint8Array_): Promise<WalletAddress[]> => {
  const firstAddress = deriveAddressAtIndex(seed, 0);
  const firstBalance = await sepolia.getNativeBalance(firstAddress.address);
  const discovered: WalletAddress[] = [{ ...firstAddress, balance: firstBalance }];

  for (let addressIndex = 1; addressIndex < MAX_DISCOVERY_SCAN; addressIndex += 1) {
    const candidate = deriveAddressAtIndex(seed, addressIndex);

    let balance = 0n;
    try {
      balance = await sepolia.getNativeBalance(candidate.address);
    } catch {
      break;
    }

    if (balance === 0n) {
      break;
    }

    discovered.push({ ...candidate, balance });
  }

  return discovered;
};

const refreshKnownAddressBalances = async (addresses: readonly WalletAddress[]): Promise<WalletAddress[]> => {
  return Promise.all(
    addresses.map(async (row) => {
      const balance = await sepolia.getNativeBalance(row.address);
      return {
        ...row,
        balance,
      };
    }),
  );
};

const isTestnetNetwork = (network: StoredNetwork): boolean => {
  if (network.name.toLowerCase().includes('testnet')) {
    return true;
  }

  return !MAINNET_CHAIN_IDS.has(network.chainId);
};

export const WalletPage = ({ wizardStep }: WalletPageProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const selectedNetwork = useAppSelector(selectSelectedNetwork);

  const isSetupRoute = wizardStep !== undefined;

  const [phase, setPhase] = useState<'setup' | 'wallet'>(isSetupRoute ? 'setup' : 'wallet');
  const [setupStep, setSetupStep] = useState<SetupStep>(wizardStep ?? 1);
  const [existingVaultDetected, setExistingVaultDetected] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [addresses, setAddresses] = useState<WalletAddress[]>([]);
  const [latestTransaction, setLatestTransaction] = useState<LatestTransaction | null>(null);
  const [networks, setNetworks] = useState<StoredNetwork[]>(() => readStoredNetworks());
  const [storedActiveNetworkId] = useState<string>(() => readStoredActiveNetwork());
  const [cachedPrimaryAddress, setCachedPrimaryAddress] = useState<Address | undefined>(() =>
    readCachedPrimaryAddress(),
  );
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanRecipient, setScanRecipient] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const setupForm = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      seedMode: 'create',
      mnemonic: '',
      bip39Passphrase: DEFAULT_BIP39_PASSPHRASE,
    },
  });

  const rememberPrimaryAddress = (nextAddresses: readonly WalletAddress[]): void => {
    const address = nextAddresses[0]?.address;
    if (!address) {
      return;
    }

    writeCachedPrimaryAddress(address);
    setCachedPrimaryAddress(address);
  };

  const getSetupPath = (step: SetupStep): '/setup/seed' | '/setup/security' | '/setup/review' => {
    if (step === 1) {
      return '/setup/seed';
    }
    if (step === 2) {
      return '/setup/security';
    }
    return '/setup/review';
  };

  useEffect(() => {
    if (!wizardStep) {
      return;
    }

    setPhase('setup');
    setSetupStep(wizardStep);
  }, [wizardStep]);

  useEffect(() => {
    void (async () => {
      try {
        const existingVault = await hasSeedVault();
        setExistingVaultDetected(existingVault);

        if (existingVault) {
          setPhase('wallet');

          try {
            const seed = await decryptSeedFromVault();
            const discoveredAddresses = await discoverSepoliaAddresses(seed);
            setAddresses(discoveredAddresses);
            rememberPrimaryAddress(discoveredAddresses);
          } catch (unlockErr) {
            toast.error(unlockErr instanceof Error ? unlockErr.message : 'WebAuthn unlock failed.');
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to inspect encrypted vault state.');
      }
    })();
  }, []);

  useEffect(() => {
    writeStoredNetworks(networks);
  }, [networks]);

  useEffect(() => {
    const selectedExists = networks.some((network) => network.id === selectedNetwork.id);
    if (selectedExists) {
      writeStoredActiveNetwork(selectedNetwork.id);
    }
  }, [networks, selectedNetwork.id]);

  useEffect(() => {
    const activeExists = networks.some((network) => network.id === selectedNetwork.id);
    if (activeExists) {
      return;
    }

    const fallbackNetwork = networks.find((network) => network.id === DEFAULT_SUPPORTED_NETWORK_ID) ?? networks[0];
    if (!fallbackNetwork) {
      return;
    }

    dispatch(selectNetwork(fallbackNetwork.id));
  }, [dispatch, networks, selectedNetwork.id]);

  const runAction = async <T,>(action: () => Promise<T>, rethrow = false): Promise<T | undefined> => {
    setIsBusy(true);

    try {
      return await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      if (rethrow) {
        throw err instanceof Error ? err : new Error(message);
      }

      toast.error(message);
      return undefined;
    } finally {
      setIsBusy(false);
    }
  };

  const selectedNetworkBase =
    networks.find((network) => network.id === selectedNetwork.id) ?? DEFAULT_PREDEFINED_NETWORK;
  const selectedNetworkSupportsRuntime = selectedNetworkBase.id === DEFAULT_SUPPORTED_NETWORK_ID;
  const displayedAddresses = selectedNetworkSupportsRuntime ? addresses : [];
  const totalBalanceWei = displayedAddresses.reduce((sum, row) => sum + row.balance, 0n);
  const primaryAddress = displayedAddresses[0]?.address ?? cachedPrimaryAddress;

  const walletNetworks = useMemo(() => {
    const mapNetworkToTokens = (network: StoredNetwork): Token[] => {
      const isActive = network.id === selectedNetworkBase.id;
      const liveNativeBalance = isActive && selectedNetworkSupportsRuntime ? formatEther(totalBalanceWei) : '0';
      const nativeSymbol = network.nativeSymbol.toUpperCase();
      const nativeBalanceDisplay = trimDecimals(liveNativeBalance || '0', 6);

      return [
        {
          id: `${network.id}-native`,
          symbol: nativeSymbol,
          name: `${network.name.replace(' Testnet', '').replace(' Mainnet', '')} Native`,
          balance: nativeBalanceDisplay,
          value: `${nativeBalanceDisplay} ${nativeSymbol}`,
          change: '+0.0%',
          positive: true,
        },
        {
          id: `${network.id}-usdc`,
          symbol: 'USDC',
          name: 'USD Coin',
          balance: '0.00',
          value: '0.00 USDC',
          change: '+0.0%',
          positive: true,
          contractAddress: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        },
        {
          id: `${network.id}-link`,
          symbol: 'LINK',
          name: 'Chainlink',
          balance: '0.00',
          value: '0.00 LINK',
          change: '+0.0%',
          positive: false,
          contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        },
      ];
    };

    return networks.map((network) => ({
      ...network,
      isTestnet: isTestnetNetwork(network),
      tokens: mapNetworkToTokens(network),
    }));
  }, [networks, selectedNetworkBase.id, selectedNetworkSupportsRuntime, totalBalanceWei]);

  useEffect(() => {
    dispatch(
      syncWalletState({
        assets: [
          {
            id: 'evm',
            symbol: 'EVM',
            name: 'EVM Wallet',
            icon: 'E',
            networks: walletNetworks,
          },
        ],
        receiveAddress: primaryAddress,
        activeNetworkSupportsRuntime: selectedNetworkSupportsRuntime,
        preferredNetworkId: storedActiveNetworkId,
      }),
    );
  }, [dispatch, primaryAddress, selectedNetworkSupportsRuntime, storedActiveNetworkId, walletNetworks]);

  const addCustomNetwork = (input: AddCustomNetworkInput) => {
    const parsed = z
      .object({
        name: z.string().trim().min(2, 'Network name is required.'),
        chainId: z.number().int().positive('Chain ID must be positive.'),
        rpcUrl: z.string().trim().url('RPC URL must be valid.'),
        nativeSymbol: z
          .string()
          .trim()
          .min(2)
          .max(10)
          .regex(/^[A-Za-z0-9]+$/u),
      })
      .safeParse(input);

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid network input.');
      return;
    }

    if (networks.some((network) => network.chainId === parsed.data.chainId)) {
      toast.error('A network with this chain ID already exists.');
      return;
    }

    const nextNetwork: StoredNetwork = {
      id: `custom-${parsed.data.chainId}-${Date.now()}`,
      name: parsed.data.name,
      chainId: parsed.data.chainId,
      rpcUrl: parsed.data.rpcUrl,
      nativeSymbol: parsed.data.nativeSymbol.toUpperCase(),
      kind: 'custom',
    };

    setNetworks((current) => [...current, nextNetwork]);
    dispatch(selectNetwork(nextNetwork.id));
    toast.success(`Added ${nextNetwork.name}`);
  };

  const removeCustomNetwork = (networkId: string) => {
    const target = networks.find((network) => network.id === networkId);
    if (!target || target.kind !== 'custom') {
      return;
    }

    setNetworks((current) => current.filter((network) => network.id !== networkId));
    if (selectedNetwork.id === networkId) {
      dispatch(selectNetwork(DEFAULT_SUPPORTED_NETWORK_ID));
    }
    toast.success(`Removed ${target.name}`);
  };

  const handleNextStep = async (): Promise<void> => {
    if (setupStep === 1) {
      const fields: Array<keyof SetupFormValues> = ['seedMode'];
      if (setupForm.getValues('seedMode') === 'import') {
        fields.push('mnemonic');
      }

      const valid = await setupForm.trigger(fields);
      if (valid) {
        await navigate({ to: getSetupPath(2) });
      }
      return;
    }

    if (setupStep === 2) {
      const valid = await setupForm.trigger(['bip39Passphrase']);
      if (valid) {
        await navigate({ to: getSetupPath(3) });
      }
    }
  };

  const handleInitializeWallet = async (values: SetupFormValues): Promise<void> => {
    await runAction(async () => {
      const mnemonic = values.seedMode === 'create' ? generateMnemonic(128) : normalizeMnemonic(values.mnemonic);
      const seed = mnemonicToSeed(mnemonic, values.bip39Passphrase);

      await setupSeedVault(seed);

      const discoveredAddresses = await discoverSepoliaAddresses(seed);

      setExistingVaultDetected(false);
      setPhase('wallet');
      setSetupStep(1);
      setGeneratedMnemonic(values.seedMode === 'create' ? mnemonic : '');
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setLatestTransaction(null);
      dispatch(selectNetwork(DEFAULT_SUPPORTED_NETWORK_ID));

      await navigate({ to: '/', replace: true });
    });
  };

  const handleOpenExistingVault = () => {
    void runAction(async () => {
      const seed = await decryptSeedFromVault();
      const discoveredAddresses = await discoverSepoliaAddresses(seed);

      setPhase('wallet');
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setLatestTransaction(null);

      await navigate({ to: '/', replace: true });
    });
  };

  const handleRefreshAddresses = () => {
    void runAction(async () => {
      if (!selectedNetworkSupportsRuntime) {
        toast.info('Only Ethereum Sepolia is currently supported for live chain operations.');
        return;
      }

      if (addresses.length === 0) {
        toast.info('No discovered addresses yet. Decrypt once to run discovery, then refresh stays unlock-free.');
        return;
      }

      const refreshed = await refreshKnownAddressBalances(addresses);
      setAddresses(refreshed);
      rememberPrimaryAddress(refreshed);
      toast.success('Balances refreshed from public chain data without unlock.');
    });
  };

  const handleSendTransaction = async (payload: { recipient: string; amount: string }): Promise<void> => {
    const parsed = sendFormSchema.safeParse({
      to: payload.recipient,
      amountEth: payload.amount,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid send payload.');
    }

    await runAction(async () => {
      if (!selectedNetworkSupportsRuntime) {
        throw new Error('Sending is currently available only on Ethereum Sepolia.');
      }

      const from = displayedAddresses[0];
      if (!from) {
        throw new Error('No derived sender address available.');
      }

      const seed = await decryptSeedFromVault();
      const privateKey = derivePrivateKeyAtIndex(seed, from.addressIndex);
      const value = parseEther(parsed.data.amountEth);
      const txHash = await sepolia.transferNative({
        privateKey,
        to: parsed.data.to as Address,
        value,
      });
      const receipt = await sepolia.waitForTransaction(txHash);

      setLatestTransaction({
        hash: txHash,
        explorerUrl: sepolia.getExplorerTxUrl(txHash),
        from: from.address,
        to: parsed.data.to as Address,
        amountEth: parsed.data.amountEth,
        status: receipt.status,
      });

      const discoveredAddresses = await discoverSepoliaAddresses(seed);
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      toast.success('Transaction confirmed');
    }, true);
  };

  const handleAddressScanned = (address: string) => {
    setScanRecipient(address);
    setScanDialogOpen(false);
    setSendDialogOpen(true);
  };

  const seedMode = setupForm.watch('seedMode');

  return (
    <div className="space-y-6 [&_button:disabled]:cursor-not-allowed [&_button]:cursor-pointer">
      {phase === 'setup' ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="rounded-lg border bg-linear-to-br from-emerald-50 to-blue-50 p-4">
            <h2 className="text-xl font-semibold tracking-tight">Wallet Setup Wizard</h2>
            <p className="mt-1 text-sm text-muted-foreground">Simple setup in three steps.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {SETUP_STEPS.map((step, index) => {
                const stepNumber = index + 1;
                const isActive = setupStep === stepNumber;
                const isDone = setupStep > stepNumber;

                return (
                  <div
                    key={step}
                    className={`rounded-md border px-3 py-2 text-center text-xs font-medium ${
                      isActive
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : isDone
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    {stepNumber}. {step}
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={setupForm.handleSubmit(handleInitializeWallet)} className="mt-5 space-y-4">
            {setupStep === 1 ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-md border p-3 text-sm">
                    <input type="radio" value="create" className="mr-2" {...setupForm.register('seedMode')} />
                    Create new mnemonic seed
                  </label>
                  <label className="rounded-md border p-3 text-sm">
                    <input type="radio" value="import" className="mr-2" {...setupForm.register('seedMode')} />
                    Import existing mnemonic seed
                  </label>
                </div>

                {seedMode === 'import' ? (
                  <label className="block space-y-2 text-sm">
                    <span className="font-medium">Mnemonic to import</span>
                    <textarea
                      {...setupForm.register('mnemonic')}
                      rows={4}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Enter your BIP39 mnemonic"
                    />
                    {setupForm.formState.errors.mnemonic ? (
                      <p className="text-xs text-destructive">{setupForm.formState.errors.mnemonic.message}</p>
                    ) : null}
                  </label>
                ) : null}
              </div>
            ) : null}

            {setupStep === 2 ? (
              <div className="space-y-4">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">BIP39 passphrase (optional)</span>
                  <input
                    {...setupForm.register('bip39Passphrase')}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  {setupForm.formState.errors.bip39Passphrase ? (
                    <p className="text-xs text-destructive">{setupForm.formState.errors.bip39Passphrase.message}</p>
                  ) : null}
                </label>
              </div>
            ) : null}

            {setupStep === 3 ? (
              <div className="rounded-md border bg-background p-4 text-sm">
                <p>
                  <span className="font-medium">Seed source:</span>{' '}
                  {seedMode === 'create' ? 'Create new mnemonic' : 'Import mnemonic'}
                </p>
                <p className="mt-2 text-muted-foreground">
                  Continue to initialize WebAuthn PRF encryption and open your wallet dashboard. Configure SLIP39 in the
                  Settings page.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {setupStep > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigate({ to: getSetupPath((setupStep - 1) as SetupStep) });
                  }}
                >
                  Back
                </Button>
              ) : null}

              {setupStep < 3 ? (
                <Button type="button" onClick={() => void handleNextStep()}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={isBusy}>
                  Initialize wallet
                </Button>
              )}

              {existingVaultDetected ? (
                <Button type="button" variant="secondary" onClick={handleOpenExistingVault} disabled={isBusy}>
                  Open existing vault
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      ) : (
        <div className="mx-auto w-full max-w-3xl">
          <WalletHeader walletAddress={primaryAddress} />
          <AssetSwitcher onAddCustomNetwork={addCustomNetwork} onRemoveCustomNetwork={removeCustomNetwork} />
          <WalletBalance />
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={handleRefreshAddresses}
              disabled={isBusy || !selectedNetworkSupportsRuntime}
            >
              Refresh Runtime Balances
            </Button>
          </div>
          <WalletActions
            onSend={() => setSendDialogOpen(true)}
            onReceive={() => setReceiveDialogOpen(true)}
            onScan={() => setScanDialogOpen(true)}
          />
          <TransactionHistory latestTransactionHash={latestTransaction?.hash} />

          <SendDialog
            open={sendDialogOpen}
            onOpenChange={(open) => {
              setSendDialogOpen(open);
              if (!open) {
                setScanRecipient('');
              }
            }}
            initialRecipient={scanRecipient}
            isSending={isBusy}
            onSend={handleSendTransaction}
          />
          <ReceiveDialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen} address={primaryAddress} />
          <ScanDialog open={scanDialogOpen} onOpenChange={setScanDialogOpen} onAddressScanned={handleAddressScanned} />

          {generatedMnemonic ? (
            <section className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Generated mnemonic (shown once)</p>
              <p className="mt-1 wrap-break-word">{generatedMnemonic}</p>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
};
