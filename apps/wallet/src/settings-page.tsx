import { zodResolver } from '@hookform/resolvers/zod';
import { combineSlip39Shares, generateSlip39Shares } from '@repo/slip39';
import type { Uint8Array_ } from '@repo/types';
import { Button } from '@repo/ui/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  clearSeedVault,
  decryptSeedFromVault,
  hasSeedVault,
  replaceSeedInVault,
  setupSeedVault,
} from './lib/webauthn-prf-vault';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

const DEFAULT_SLIP39_PASSPHRASE = 'backup';
const PRINTABLE_ASCII_REGEX = /^[\x20-\x7E]*$/u;

const slip39FormSchema = z.object({
  slip39Passphrase: z.string().regex(PRINTABLE_ASCII_REGEX, 'Use printable ASCII characters only.'),
  sharesInput: z.string(),
});

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

type Slip39FormValues = z.infer<typeof slip39FormSchema>;

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

export const SettingsPage = () => {
  const [status, setStatus] = useState('Manage SLIP39 backups and vault maintenance here.');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const slip39Form = useForm<Slip39FormValues>({
    resolver: zodResolver(slip39FormSchema),
    defaultValues: {
      slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
      sharesInput: '',
    },
  });

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

  const handleGenerateSlip39Shares = async (values: Slip39FormValues): Promise<void> => {
    await runAction(async () => {
      const seed = await decryptSeedFromVault();
      const shares = createSlip39Backup(seed, values.slip39Passphrase);

      slip39Form.setValue('sharesInput', shares.slice(0, 2).join('\n'), { shouldDirty: true, shouldTouch: true });
      setStatus('SLIP39 shares generated from unlocked seed. Store all shares safely offline.');
      toast.success('SLIP39 shares generated');
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
      const vaultExists = await hasSeedVault();

      if (vaultExists) {
        await replaceSeedInVault(recoveredSeed);
      } else {
        await setupSeedVault(recoveredSeed);
      }

      setStatus('Seed recovered from SLIP39 and encrypted into vault.');
      toast.success('Seed recovered');
    });
  };

  const handleClearVault = (): void => {
    void runAction(async () => {
      await clearSeedVault();
      slip39Form.reset({
        slip39Passphrase: DEFAULT_SLIP39_PASSPHRASE,
        sharesInput: '',
      });
      setStatus('Vault cleared successfully.');
      toast.success('Vault cleared');
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 [&_button:disabled]:cursor-not-allowed [&_button]:cursor-pointer">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              SLIP39 backup and recovery is now managed from this page.
            </p>
          </div>
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            Back to wallet
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Shamir Backup (SLIP39)</CardTitle>
          <CardDescription>Generate 2-of-3 shares, or recover a seed from at least two shares.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3">
            <div className="space-y-2 text-sm">
              <Label htmlFor="slip39-passphrase">SLIP39 passphrase</Label>
              <Input
                id="slip39-passphrase"
                {...slip39Form.register('slip39Passphrase')}
                placeholder="SLIP39 passphrase"
              />
            </div>

            <div className="space-y-2 text-sm">
              <Label htmlFor="slip39-shares">Shares</Label>
              <textarea
                id="slip39-shares"
                {...slip39Form.register('sharesInput')}
                rows={7}
                className="border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] flex min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none"
                placeholder="Paste 2 or more SLIP39 shares"
              />
              {slip39Form.formState.errors.sharesInput ? (
                <p className="text-xs text-destructive">{slip39Form.formState.errors.sharesInput.message}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  void slip39Form.handleSubmit(handleGenerateSlip39Shares)();
                }}
                disabled={isBusy}
              >
                Unlock + generate shares
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void slip39Form.handleSubmit(handleRecoverSeedFromShares)();
                }}
                disabled={isBusy}
              >
                Recover seed from shares
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
