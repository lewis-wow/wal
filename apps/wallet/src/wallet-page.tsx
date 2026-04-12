import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { masterFromSeed } from '@repo/bip32';
import { generateMnemonic, mnemonicToSeed } from '@repo/bip39';
import { Bip44Chain, Bip44CoinType, deriveBip44AddressNodeFromMaster, getBip44AddressPath } from '@repo/bip44';
import { combineSlip39Shares, generateSlip39Shares } from '@repo/slip39';
import { Button } from '@repo/ui/components/ui/button';
import type { Uint8Array_ } from '@repo/types';
import { bytesToHex } from '@repo/utils';
import { useForm } from 'react-hook-form';
import { privateKeyToAccount } from 'viem/accounts';
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
const DEFAULT_DERIVATION = {
  account: 0,
  chain: Bip44Chain.External,
  addressIndex: 0,
} as const;

const PRINTABLE_ASCII_REGEX = /^[\x20-\x7E]*$/u;

const setupFormSchema = z.object({
  bip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
});

type SetupFormValues = z.infer<typeof setupFormSchema>;

const signFormSchema = z.object({
  signMessageInput: z.string().trim().min(1, 'Message is required.'),
});

type SignFormValues = z.infer<typeof signFormSchema>;

const backupFormSchema = z.object({
  slip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
  sharesInput: z.string(),
});

type BackupFormValues = z.infer<typeof backupFormSchema>;

const backupRecoverSchema = backupFormSchema.extend({
  sharesInput: z
    .string()
    .trim()
    .min(1, 'Enter SLIP39 shares to recover.')
    .refine(
      (value) =>
        value
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0).length >= 2,
      'Provide at least two SLIP39 shares.',
    ),
});

type DerivedWalletData = {
  path: string;
  address: string;
  privateKeyHex: `0x${string}`;
  xpub: string;
};

const deriveWalletData = (seed: Uint8Array_): DerivedWalletData => {
  const masterNode = masterFromSeed({ seed });

  const path = getBip44AddressPath({
    coinType: Bip44CoinType.Ether,
    account: DEFAULT_DERIVATION.account,
    chain: DEFAULT_DERIVATION.chain,
    addressIndex: DEFAULT_DERIVATION.addressIndex,
  });

  const addressNode = deriveBip44AddressNodeFromMaster(masterNode, {
    coinType: Bip44CoinType.Ether,
    account: DEFAULT_DERIVATION.account,
    chain: DEFAULT_DERIVATION.chain,
    addressIndex: DEFAULT_DERIVATION.addressIndex,
  });

  if (!addressNode.privateKey) {
    throw new Error('Expected a private key for the derived BIP44 address node');
  }

  const privateKeyHex = `0x${bytesToHex(addressNode.privateKey)}` as `0x${string}`;
  const account = privateKeyToAccount(privateKeyHex);

  return {
    path,
    address: account.address,
    privateKeyHex,
    xpub: masterNode.neuter().toXpub(),
  };
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

export const WalletPage = () => {
  const [vaultReady, setVaultReady] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [derived, setDerived] = useState<DerivedWalletData | null>(null);
  const [signature, setSignature] = useState('');
  const [shares, setShares] = useState<string[]>([]);
  const [recoveredSeedHex, setRecoveredSeedHex] = useState('');
  const [status, setStatus] = useState(
    'Create a wallet to register WebAuthn PRF and store an encrypted seed in IndexedDB.',
  );
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const setupForm = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      bip39Passphrase: DEFAULT_BIP39_PASSPHRASE,
    },
  });

  const signForm = useForm<SignFormValues>({
    resolver: zodResolver(signFormSchema),
    defaultValues: {
      signMessageInput: 'Wal wallet signature test',
    },
  });

  const backupForm = useForm<BackupFormValues>({
    resolver: zodResolver(backupFormSchema),
    defaultValues: {
      slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
      sharesInput: '',
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const existingVault = await hasSeedVault();
        setVaultReady(existingVault);
        if (existingVault) {
          setStatus('Encrypted seed detected. Any seed/private-key action will request WebAuthn verification.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to inspect vault state');
      }
    })();
  }, []);

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

  const handleGenerateWallet = async (values: SetupFormValues): Promise<void> => {
    await runAction(async () => {
      const nextMnemonic = generateMnemonic(128);
      const nextSeed = mnemonicToSeed(nextMnemonic, values.bip39Passphrase);
      const nextShares = createSlip39Backup(nextSeed, backupForm.getValues('slip39Passphrase'));

      await setupSeedVault(nextSeed);

      setVaultReady(true);
      setDerived(deriveWalletData(nextSeed));
      setSignature('');
      setRecoveredSeedHex('');

      setGeneratedMnemonic(nextMnemonic);
      setShares(nextShares);
      backupForm.setValue('sharesInput', nextShares.slice(0, 2).join('\n'), { shouldDirty: true, shouldTouch: true });
      setStatus(
        'Wallet created. Seed encrypted with WebAuthn PRF and stored in IndexedDB. Future actions require PRF unlock.',
      );
    });
  };

  const handleUnlockAndDerive = () => {
    void runAction(async () => {
      const seed = await decryptSeedFromVault();
      setDerived(deriveWalletData(seed));
      setStatus('Seed decrypted with PRF and wallet data derived successfully.');
    });
  };

  const handleSignMessage = async (values: SignFormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const walletData = deriveWalletData(seed);
      const account = privateKeyToAccount(walletData.privateKeyHex);
      const nextSignature = await account.signMessage({ message: values.signMessageInput });

      setDerived(walletData);
      setSignature(nextSignature);
      setStatus('Message signed after decrypting seed from vault via WebAuthn PRF.');
    });
  };

  const handleRegenerateShares = async (values: BackupFormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const nextShares = createSlip39Backup(seed, values.slip39Passphrase);

      setShares(nextShares);
      backupForm.setValue('sharesInput', nextShares.slice(0, 2).join('\n'), { shouldDirty: true, shouldTouch: true });
      setRecoveredSeedHex('');
      setStatus('Generated fresh SLIP39 2-of-3 seed shares.');
    });
  };

  const handleRecoverSeedFromShares = async (values: BackupFormValues): Promise<void> => {
    const parsed = backupRecoverSchema.safeParse(values);
    if (!parsed.success) {
      const sharesIssue = parsed.error.issues.find((issue) => issue.path[0] === 'sharesInput');
      if (sharesIssue) {
        backupForm.setError('sharesInput', {
          type: 'manual',
          message: sharesIssue.message,
        });
      }
      return;
    }

    await runAction(async () => {
      backupForm.clearErrors('sharesInput');
      const recoveredSeed = recoverSeedFromSlip39(parsed.data.sharesInput, parsed.data.slip39Passphrase);
      await replaceSeedInVault(recoveredSeed);

      setVaultReady(true);
      setDerived(deriveWalletData(recoveredSeed));
      setSignature('');
      setRecoveredSeedHex(bytesToHex(recoveredSeed));
      setStatus('Seed recovered from SLIP39 and re-encrypted in IndexedDB using PRF-derived key.');
    });
  };

  const handleResetVault = () => {
    void runAction(async () => {
      await clearSeedVault();

      setVaultReady(false);
      setGeneratedMnemonic('');
      setDerived(null);
      setSignature('');
      setShares([]);
      backupForm.setValue('sharesInput', '', { shouldDirty: false, shouldTouch: false });
      setRecoveredSeedHex('');
      setStatus('Vault cleared. Generate a new wallet to register PRF again.');
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">WebAuthn PRF Vault</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A generated BIP39 seed is encrypted with a key derived from WebAuthn PRF and persisted with idb-keyval in
          IndexedDB.
        </p>

        <form onSubmit={setupForm.handleSubmit(handleGenerateWallet)} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">BIP39 passphrase (optional)</span>
              <input
                {...setupForm.register('bip39Passphrase')}
                placeholder=""
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              {setupForm.formState.errors.bip39Passphrase ? (
                <p className="text-xs text-destructive">{setupForm.formState.errors.bip39Passphrase.message}</p>
              ) : null}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={isBusy}>
              Create wallet + encrypt seed
            </Button>
            <Button type="button" variant="secondary" onClick={handleResetVault} disabled={isBusy}>
              Clear vault
            </Button>
          </div>
        </form>

        <p className="mt-4 text-sm">
          <span className="font-medium">Vault status:</span>{' '}
          <span className={vaultReady ? 'text-foreground' : 'text-muted-foreground'}>
            {vaultReady ? 'Encrypted seed available' : 'No encrypted seed yet'}
          </span>
        </p>

        {generatedMnemonic ? (
          <div className="mt-4 rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">Generated mnemonic (shown once)</p>
            <p className="mt-1 break-words text-muted-foreground">{generatedMnemonic}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Wallet Actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every action below decrypts the seed from IndexedDB via a fresh WebAuthn PRF evaluation.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleUnlockAndDerive} disabled={isBusy || !vaultReady}>
            Unlock + derive address
          </Button>
        </div>

        {derived ? (
          <div className="mt-4 grid gap-3 text-sm">
            <p>
              <span className="font-medium">Path:</span> {derived.path}
            </p>
            <p className="break-all">
              <span className="font-medium">Address (viem):</span> {derived.address}
            </p>
            <p className="break-all">
              <span className="font-medium">Private key:</span> {derived.privateKeyHex}
            </p>
            <p className="break-all">
              <span className="font-medium">Master xpub:</span> {derived.xpub}
            </p>
          </div>
        ) : null}

        <form onSubmit={signForm.handleSubmit(handleSignMessage)} className="mt-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Message to sign</span>
            <textarea
              {...signForm.register('signMessageInput')}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {signForm.formState.errors.signMessageInput ? (
              <p className="text-xs text-destructive">{signForm.formState.errors.signMessageInput.message}</p>
            ) : null}
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={isBusy || !vaultReady}>
              Unlock + sign message
            </Button>
          </div>
        </form>

        {signature ? (
          <div className="mt-4 rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">Signature</p>
            <p className="mt-1 break-all text-muted-foreground">{signature}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">SLIP39 Backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shares are generated from the decrypted seed using a 2-of-3 setup. Recovery re-encrypts the seed back into
          IndexedDB.
        </p>

        <form onSubmit={backupForm.handleSubmit(handleRegenerateShares)} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">SLIP39 passphrase</span>
              <input
                {...backupForm.register('slip39Passphrase')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              {backupForm.formState.errors.slip39Passphrase ? (
                <p className="text-xs text-destructive">{backupForm.formState.errors.slip39Passphrase.message}</p>
              ) : null}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={isBusy || !vaultReady}>
              Unlock + generate shares
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {shares.map((share, index) => (
              <div key={`${index}-${share.slice(0, 16)}`} className="rounded-md border bg-background p-3 text-sm">
                <p className="mb-1 font-medium">Share {index + 1}</p>
                <p className="break-words text-muted-foreground">{share}</p>
              </div>
            ))}
          </div>

          <label className="mt-4 block space-y-2 text-sm">
            <span className="font-medium">Shares for recovery (one per line)</span>
            <textarea
              {...backupForm.register('sharesInput')}
              rows={7}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Paste 2 or more SLIP39 mnemonics, one per line"
            />
            {backupForm.formState.errors.sharesInput ? (
              <p className="text-xs text-destructive">{backupForm.formState.errors.sharesInput.message}</p>
            ) : null}
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                void backupForm.handleSubmit(handleRecoverSeedFromShares)();
              }}
              disabled={isBusy}
            >
              Recover seed + re-encrypt vault
            </Button>
          </div>
        </form>

        {recoveredSeedHex ? (
          <div className="mt-4 rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">Recovered seed (hex)</p>
            <p className="mt-1 break-all text-muted-foreground">{recoveredSeedHex}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm shadow-sm sm:p-6">
        <p className="font-medium">Status</p>
        <p className="mt-1 text-muted-foreground">{status}</p>
        {isBusy ? <p className="mt-2 text-muted-foreground">Waiting for WebAuthn prompt...</p> : null}
        {error ? <p className="mt-2 text-destructive">{error}</p> : null}
      </section>
    </div>
  );
};
