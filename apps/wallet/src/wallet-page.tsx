import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { masterFromSeed } from '@repo/bip32';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@repo/bip39';
import { Bip44Chain, Bip44CoinType, deriveBip44AddressNodeFromMaster, getBip44AddressPath } from '@repo/bip44';
import { SepoliaIntegration } from '@repo/eth-sepolia';
import { combineSlip39Shares, generateSlip39Shares } from '@repo/slip39';
import type { Uint8Array_ } from '@repo/types';
import { Button } from '@repo/ui/components/ui/button';
import { bytesToHex } from '@repo/utils';
import { FiDownload, FiSend } from 'react-icons/fi';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Address, Hex } from 'viem';
import { formatEther, isAddress, parseEther } from 'viem';
import { z } from 'zod';

import {
  clearSeedVault,
  decryptSeedFromVault,
  hasSeedVault,
  replaceSeedInVault,
  setupSeedVault,
} from './lib/webauthn-prf-vault';

const DEFAULT_BIP39_PASSPHRASE = '';
const DEFAULT_SLIP39_PASSPHRASE = 'backup';
const DEFAULT_DERIVATION_ACCOUNT = 0;
const DEFAULT_ADDRESS_CHAIN = Bip44Chain.External;
const MAX_DISCOVERY_SCAN = 10;
const PUBLIC_PRIMARY_ADDRESS_KEY = 'wallet-primary-address-v1';
const SETUP_STEPS = ['Seed', 'Security', 'Review'] as const;
const PRINTABLE_ASCII_REGEX = /^[\x20-\x7E]*$/u;

const sepolia = new SepoliaIntegration();

type SetupStep = 1 | 2 | 3;
type QuickAction = 'send' | 'receive';

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

const normalizeMnemonic = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .join(' ');
};

const shortenAddress = (value: Address): string => {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const formatSepAmount = (value: bigint): string => {
  return `${formatEther(value)} SEP`;
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

const clearCachedPrimaryAddress = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(PUBLIC_PRIMARY_ADDRESS_KEY);
};

const setupFormSchema = z
  .object({
    seedMode: z.enum(['create', 'import']),
    mnemonic: z.string(),
    bip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
    useSlip39: z.boolean(),
    slip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
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

const signFormSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.'),
});

type SignFormValues = z.infer<typeof signFormSchema>;

const sendFormSchema = z.object({
  fromAddressIndex: z.coerce.number().int().min(0),
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

type SendFormInputValues = z.input<typeof sendFormSchema>;
type SendFormValues = z.output<typeof sendFormSchema>;

const slip39FormSchema = z.object({
  slip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
  sharesInput: z.string(),
});

type Slip39FormValues = z.infer<typeof slip39FormSchema>;

const slip39RecoverSchema = slip39FormSchema.extend({
  sharesInput: z
    .string()
    .trim()
    .min(1, 'Enter SLIP39 shares to recover.')
    .refine(
      (input) =>
        input
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0).length >= 2,
      'Provide at least two SLIP39 shares.',
    ),
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

const createSlip39Backup = (seed: Uint8Array_, slip39Passphrase: string): string[] => {
  return generateSlip39Shares({
    masterSecret: seed,
    groupThreshold: 1,
    groups: [{ memberThreshold: 2, memberCount: 3 }],
    passphrase: slip39Passphrase,
    extendable: true,
    iterationExponent: 1,
  }).map((share) => share.mnemonic);
};

const recoverSeedFromSlip39 = (sharesText: string, slip39Passphrase: string): Uint8Array_ => {
  const shares = sharesText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return combineSlip39Shares(shares, slip39Passphrase);
};

const getPrimarySepoliaAccount = (seed: Uint8Array_) => {
  const privateKey = derivePrivateKeyAtIndex(seed, 0);
  return sepolia.createAccount(privateKey);
};

export const WalletPage = () => {
  const [phase, setPhase] = useState<'setup' | 'wallet'>('setup');
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [vaultReady, setVaultReady] = useState(false);
  const [existingVaultDetected, setExistingVaultDetected] = useState(false);
  const [slip39Enabled, setSlip39Enabled] = useState(true);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [addresses, setAddresses] = useState<WalletAddress[]>([]);
  const [signature, setSignature] = useState('');
  const [latestTransaction, setLatestTransaction] = useState<LatestTransaction | null>(null);
  const [activeAction, setActiveAction] = useState<QuickAction>('send');
  const [cachedPrimaryAddress, setCachedPrimaryAddress] = useState<Address | undefined>(() =>
    readCachedPrimaryAddress(),
  );
  const [status, setStatus] = useState('Set up your wallet in three quick steps.');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const rememberPrimaryAddress = (nextAddresses: readonly WalletAddress[]): void => {
    const address = nextAddresses[0]?.address;
    if (!address) {
      return;
    }

    writeCachedPrimaryAddress(address);
    setCachedPrimaryAddress(address);
  };

  const setupForm = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      seedMode: 'create',
      mnemonic: '',
      bip39Passphrase: DEFAULT_BIP39_PASSPHRASE,
      useSlip39: true,
      slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
    },
  });

  const sendForm = useForm<SendFormInputValues, unknown, SendFormValues>({
    resolver: zodResolver(sendFormSchema),
    defaultValues: {
      fromAddressIndex: 0,
      to: '',
      amountEth: '',
    },
  });

  const signForm = useForm<SignFormValues>({
    resolver: zodResolver(signFormSchema),
    defaultValues: {
      message: 'Wal wallet signature test',
    },
  });

  const slip39Form = useForm<Slip39FormValues>({
    resolver: zodResolver(slip39FormSchema),
    defaultValues: {
      slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
      sharesInput: '',
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const existingVault = await hasSeedVault();
        setExistingVaultDetected(existingVault);
        setVaultReady(existingVault);

        if (existingVault) {
          setPhase('wallet');
          setStatus('Encrypted seed detected. Requesting WebAuthn PRF unlock...');

          try {
            const seed = await decryptSeedFromVault();
            const discoveredAddresses = await discoverSepoliaAddresses(seed);

            setAddresses(discoveredAddresses);
            rememberPrimaryAddress(discoveredAddresses);
            setLatestTransaction(null);
            setStatus(
              discoveredAddresses.length > 1
                ? `Vault unlocked. Found ${discoveredAddresses.length} active addresses.`
                : 'Vault unlocked. Found only the primary address.',
            );
          } catch (unlockErr) {
            setStatus('Encrypted seed detected. Unlock is required to decrypt seed and discover addresses.');
            setError(unlockErr instanceof Error ? unlockErr.message : 'WebAuthn unlock failed.');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to inspect encrypted vault state.');
      }
    })();
  }, []);

  useEffect(() => {
    if (addresses.length === 0) {
      return;
    }

    const currentIndex = sendForm.getValues('fromAddressIndex');
    const hasAddress = addresses.some((address) => address.addressIndex === currentIndex);

    if (!hasAddress) {
      const firstAddress = addresses[0];
      if (!firstAddress) {
        return;
      }

      sendForm.setValue('fromAddressIndex', firstAddress.addressIndex, { shouldDirty: true });
    }
  }, [addresses, sendForm]);

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setIsBusy(true);
    setError('');

    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleNextStep = async (): Promise<void> => {
    if (setupStep === 1) {
      const fields: Array<keyof SetupFormValues> = ['seedMode'];
      if (setupForm.getValues('seedMode') === 'import') {
        fields.push('mnemonic');
      }

      const valid = await setupForm.trigger(fields);
      if (valid) {
        setSetupStep(2);
      }
      return;
    }

    if (setupStep === 2) {
      const fields: Array<keyof SetupFormValues> = ['bip39Passphrase', 'useSlip39'];
      if (setupForm.getValues('useSlip39')) {
        fields.push('slip39Passphrase');
      }

      const valid = await setupForm.trigger(fields);
      if (valid) {
        setSetupStep(3);
      }
    }
  };

  const handleInitializeWallet = async (values: SetupFormValues): Promise<void> => {
    await runAction(async () => {
      const mnemonic = values.seedMode === 'create' ? generateMnemonic(128) : normalizeMnemonic(values.mnemonic);
      const seed = mnemonicToSeed(mnemonic, values.bip39Passphrase);

      await setupSeedVault(seed);

      const discoveredAddresses = await discoverSepoliaAddresses(seed);
      const nextShares = values.useSlip39 ? createSlip39Backup(seed, values.slip39Passphrase) : [];

      setVaultReady(true);
      setExistingVaultDetected(false);
      setPhase('wallet');
      setSetupStep(1);
      setSlip39Enabled(values.useSlip39);
      setGeneratedMnemonic(values.seedMode === 'create' ? mnemonic : '');
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setSignature('');
      setLatestTransaction(null);
      slip39Form.setValue('slip39Passphrase', values.slip39Passphrase, { shouldDirty: false, shouldTouch: false });
      slip39Form.setValue('sharesInput', nextShares.slice(0, 2).join('\n'), { shouldDirty: true, shouldTouch: true });

      setStatus(
        discoveredAddresses.length > 1
          ? `Wallet ready. Found ${discoveredAddresses.length} active addresses.`
          : 'Wallet ready. Found only the primary address.',
      );
    });
  };

  const handleOpenExistingVault = () => {
    void runAction(async () => {
      const seed = await decryptSeedFromVault();
      const discoveredAddresses = await discoverSepoliaAddresses(seed);

      setPhase('wallet');
      setSlip39Enabled(true);
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setLatestTransaction(null);
      setStatus(
        discoveredAddresses.length > 1
          ? `Existing vault opened. Found ${discoveredAddresses.length} active addresses.`
          : 'Existing vault opened. Found only the primary address.',
      );
    });
  };

  const handleRefreshAddresses = () => {
    void runAction(async () => {
      if (addresses.length === 0) {
        setStatus('No discovered addresses yet. Decrypt once to run discovery, then refresh stays unlock-free.');
        return;
      }

      const refreshed = await refreshKnownAddressBalances(addresses);
      setAddresses(refreshed);
      rememberPrimaryAddress(refreshed);
      setStatus('Balances refreshed from public chain data without unlock.');
    });
  };

  const handleSendTransaction = async (values: SendFormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const fromAddress = deriveAddressAtIndex(seed, values.fromAddressIndex);
      const privateKey = derivePrivateKeyAtIndex(seed, values.fromAddressIndex);
      const value = parseEther(values.amountEth);
      const txHash = await sepolia.transferNative({
        privateKey,
        to: values.to as Address,
        value,
      });
      const receipt = await sepolia.waitForTransaction(txHash);

      setLatestTransaction({
        hash: txHash,
        explorerUrl: sepolia.getExplorerTxUrl(txHash),
        from: fromAddress.address,
        to: values.to as Address,
        amountEth: values.amountEth,
        status: receipt.status,
      });
      const discoveredAddresses = await discoverSepoliaAddresses(seed);
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setStatus('Transaction confirmed on Sepolia.');
    });
  };

  const handleSignMessage = async (values: SignFormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const account = getPrimarySepoliaAccount(seed);
      const nextSignature = await account.signMessage({ message: values.message });

      setSignature(nextSignature);
      setStatus('Message signed successfully after vault unlock.');
    });
  };

  const handleGenerateSlip39Shares = async (values: Slip39FormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const nextShares = createSlip39Backup(seed, values.slip39Passphrase);

      slip39Form.setValue('sharesInput', nextShares.slice(0, 2).join('\n'), { shouldDirty: true, shouldTouch: true });
      setStatus('SLIP39 shares generated from unlocked seed.');
    });
  };

  const handleRecoverSeedFromShares = async (values: Slip39FormValues): Promise<void> => {
    const parsed = slip39RecoverSchema.safeParse(values);

    if (!parsed.success) {
      const sharesIssue = parsed.error.issues.find((issue) => issue.path[0] === 'sharesInput');
      if (sharesIssue) {
        slip39Form.setError('sharesInput', {
          type: 'manual',
          message: sharesIssue.message,
        });
      }
      return;
    }

    await runAction(async () => {
      slip39Form.clearErrors('sharesInput');
      const recoveredSeed = recoverSeedFromSlip39(parsed.data.sharesInput, parsed.data.slip39Passphrase);
      await replaceSeedInVault(recoveredSeed);

      setVaultReady(true);
      const discoveredAddresses = await discoverSepoliaAddresses(recoveredSeed);
      setAddresses(discoveredAddresses);
      rememberPrimaryAddress(discoveredAddresses);
      setSignature('');
      setStatus('Seed recovered from SLIP39 and re-encrypted into vault.');
    });
  };

  const handleResetVault = () => {
    void runAction(async () => {
      await clearSeedVault();

      setVaultReady(false);
      setExistingVaultDetected(false);
      setPhase('setup');
      setSetupStep(1);
      setSlip39Enabled(true);
      setGeneratedMnemonic('');
      setAddresses([]);
      setSignature('');
      setLatestTransaction(null);
      setCachedPrimaryAddress(undefined);
      clearCachedPrimaryAddress();
      setupForm.reset({
        seedMode: 'create',
        mnemonic: '',
        bip39Passphrase: DEFAULT_BIP39_PASSPHRASE,
        useSlip39: true,
        slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
      });
      sendForm.reset({
        fromAddressIndex: 0,
        to: '',
        amountEth: '',
      });
      signForm.reset({ message: 'Wal wallet signature test' });
      slip39Form.reset({
        slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
        sharesInput: '',
      });

      setStatus('Vault cleared. Start setup again.');
    });
  };

  const seedMode = setupForm.watch('seedMode');
  const useSlip39 = setupForm.watch('useSlip39');
  const totalBalance = addresses.reduce((sum, row) => sum + row.balance, 0n);
  const primaryAddress = addresses[0]?.address ?? cachedPrimaryAddress;
  const assetRows = addresses.map((address, index) => ({
    symbol: index === 0 ? 'SEP' : `S${address.addressIndex}`,
    name: index === 0 ? 'Sepolia' : `Sepolia #${address.addressIndex}`,
    amountLabel: formatSepAmount(address.balance),
    address: address.address,
  }));

  const handleCopyPrimaryAddress = async (): Promise<void> => {
    if (!primaryAddress) {
      setStatus('No primary address available yet.');
      toast.error('No address to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(primaryAddress);
      setStatus('Primary address copied to clipboard.');
      toast.success('Address copied');
    } catch {
      setStatus('Unable to copy address in this browser context.');
      toast.error('Failed to copy address');
    }
  };

  return (
    <div className="space-y-6 [&_button:disabled]:cursor-not-allowed [&_button]:cursor-pointer">
      {phase === 'setup' ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="rounded-lg border bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
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

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...setupForm.register('useSlip39')} />
                  Enable Shamir backup (SLIP39)
                </label>

                {useSlip39 ? (
                  <label className="block space-y-2 text-sm">
                    <span className="font-medium">SLIP39 passphrase</span>
                    <input
                      {...setupForm.register('slip39Passphrase')}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                    {setupForm.formState.errors.slip39Passphrase ? (
                      <p className="text-xs text-destructive">{setupForm.formState.errors.slip39Passphrase.message}</p>
                    ) : null}
                  </label>
                ) : null}
              </div>
            ) : null}

            {setupStep === 3 ? (
              <div className="rounded-md border bg-background p-4 text-sm">
                <p>
                  <span className="font-medium">Seed source:</span>{' '}
                  {seedMode === 'create' ? 'Create new mnemonic' : 'Import mnemonic'}
                </p>
                <p className="mt-2">
                  <span className="font-medium">Backup mode:</span>{' '}
                  {useSlip39 ? 'SLIP39 enabled (2-of-3)' : 'SLIP39 disabled'}
                </p>
                <p className="mt-2 text-muted-foreground">
                  Continue to initialize WebAuthn PRF encryption and open your wallet dashboard.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {setupStep > 1 ? (
                <Button type="button" variant="secondary" onClick={() => setSetupStep((setupStep - 1) as SetupStep)}>
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
        <div className="mx-auto max-w-4xl space-y-5 rounded-3xl bg-[#f5f5f7] p-4 sm:p-6">
          <section className="flex items-center justify-between rounded-2xl bg-transparent px-1 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                W
              </div>
              <div>
                <h2 className="text-2xl font-semibold leading-none tracking-tight">My Wallet</h2>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyPrimaryAddress();
                  }}
                  className="mt-1 text-sm text-zinc-500 hover:text-zinc-700"
                >
                  {primaryAddress ? shortenAddress(primaryAddress) : 'Address not loaded yet'}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">Total Balance</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight text-zinc-950">{formatSepAmount(totalBalance)}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-500">Sepolia testnet balance (no fiat pricing)</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleRefreshAddresses} disabled={isBusy || addresses.length === 0}>
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveAction('send')}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm ${activeAction === 'send' ? 'border-zinc-900' : ''}`}
            >
              <FiSend className="h-5 w-5 text-zinc-800" />
              <p className="mt-2 text-base font-medium">Send</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveAction('receive')}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm ${activeAction === 'receive' ? 'border-zinc-900' : ''}`}
            >
              <FiDownload className="h-5 w-5 text-zinc-800" />
              <p className="mt-2 text-base font-medium">Receive</p>
            </button>
          </section>

          {activeAction === 'send' ? (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Create Transaction</h3>
              <form onSubmit={sendForm.handleSubmit(handleSendTransaction)} className="mt-4 space-y-4">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">From address</span>
                  <select
                    {...sendForm.register('fromAddressIndex')}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {addresses.map((address) => (
                      <option key={address.address} value={address.addressIndex}>
                        #{address.addressIndex} {shortenAddress(address.address)} ({formatSepAmount(address.balance)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">To address</span>
                  <input
                    {...sendForm.register('to')}
                    placeholder="0x..."
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  {sendForm.formState.errors.to ? (
                    <p className="text-xs text-destructive">{sendForm.formState.errors.to.message}</p>
                  ) : null}
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">Amount (SEP)</span>
                  <input
                    {...sendForm.register('amountEth')}
                    placeholder="0.001"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  {sendForm.formState.errors.amountEth ? (
                    <p className="text-xs text-destructive">{sendForm.formState.errors.amountEth.message}</p>
                  ) : null}
                </label>
                <Button type="submit" disabled={isBusy || !vaultReady || addresses.length === 0}>
                  Unlock + send transaction
                </Button>
              </form>
              {latestTransaction ? (
                <div className="mt-4 rounded-md border bg-background p-3 text-sm">
                  <p className="font-medium">Latest transaction</p>
                  <p className="mt-1 text-muted-foreground">Hash: {latestTransaction.hash}</p>
                  <p className="mt-1 text-muted-foreground">Status: {latestTransaction.status}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeAction === 'receive' ? (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Receive</h3>
              <p className="mt-2 break-all text-sm text-zinc-600">
                {primaryAddress ?? 'No public address cached yet. Decrypt once to derive and cache receive address.'}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void handleCopyPrimaryAddress();
                  }}
                  disabled={!primaryAddress}
                >
                  Copy address
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-3xl font-semibold tracking-tight">Assets</h3>
            {assetRows.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No assets loaded yet. Decrypt once to discover addresses.</p>
            ) : (
              <div className="mt-5 space-y-4">
                {assetRows.map((asset) => (
                  <div key={asset.address} className="flex items-center justify-between rounded-xl px-2 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                        {asset.symbol}
                      </div>
                      <div>
                        <p className="text-2xl font-medium leading-tight">{asset.name}</p>
                        <p className="text-base text-zinc-500">{shortenAddress(asset.address)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold leading-tight">{asset.amountLabel}</p>
                      <p className="text-base text-zinc-500">Testnet</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <details className="rounded-2xl border bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-base font-semibold">Advanced Wallet Controls</summary>
            <div className="mt-4 grid gap-4">
              <section>
                <h4 className="font-medium">Sign Message</h4>
                <form onSubmit={signForm.handleSubmit(handleSignMessage)} className="mt-3 space-y-3">
                  <textarea
                    {...signForm.register('message')}
                    rows={3}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <Button type="submit" disabled={isBusy || !vaultReady}>
                    Unlock + sign
                  </Button>
                  {signature ? <p className="break-all text-xs text-muted-foreground">{signature}</p> : null}
                </form>
              </section>

              {slip39Enabled ? (
                <section>
                  <h4 className="font-medium">SLIP39 Backup</h4>
                  <form className="mt-3 space-y-3">
                    <input
                      {...slip39Form.register('slip39Passphrase')}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="SLIP39 passphrase"
                    />
                    <textarea
                      {...slip39Form.register('sharesInput')}
                      rows={5}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Paste 2 or more SLIP39 shares"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          void slip39Form.handleSubmit(handleGenerateSlip39Shares)();
                        }}
                        disabled={isBusy || !vaultReady}
                      >
                        Unlock + generate
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void slip39Form.handleSubmit(handleRecoverSeedFromShares)();
                        }}
                        disabled={isBusy}
                      >
                        Recover seed
                      </Button>
                    </div>
                  </form>
                </section>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setPhase('setup')} disabled={isBusy}>
                  Setup wizard
                </Button>
                <Button variant="secondary" onClick={handleResetVault} disabled={isBusy}>
                  Clear vault
                </Button>
              </div>
            </div>
          </details>

          {generatedMnemonic ? (
            <section className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Generated mnemonic (shown once)</p>
              <p className="mt-1 break-words">{generatedMnemonic}</p>
            </section>
          ) : null}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 text-sm shadow-sm sm:p-6">
        <p className="font-medium">Status</p>
        <p className="mt-1 text-muted-foreground">{status}</p>
        {isBusy ? <p className="mt-2 text-muted-foreground">Waiting for WebAuthn prompt...</p> : null}
        {error ? <p className="mt-2 text-destructive">{error}</p> : null}
      </section>
    </div>
  );
};
