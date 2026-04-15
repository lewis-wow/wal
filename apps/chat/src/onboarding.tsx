import React from 'react';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@repo/bip39';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch } from './lib/chat-store';
import { setSeed } from './lib/chat-store';
import { Button } from '@repo/ui/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { saveSeed } from './lib/seed-vault';

const onboardingFormSchema = z.object({
  mnemonic: z
    .string()
    .min(1, 'Mnemonic phrase is required')
    .refine((value) => validateMnemonic(value), 'Invalid mnemonic phrase'),
});

type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

export function Onboarding() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    mode: 'onChange',
    defaultValues: {
      mnemonic: '',
    },
  });

  const handleGenerate = () => {
    const newMnemonic = generateMnemonic(256);
    setValue('mnemonic', newMnemonic, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const handleContinue = async (values: OnboardingFormValues) => {
    try {
      const seed = mnemonicToSeed(values.mnemonic);
      await saveSeed(seed);
      dispatch(setSeed(seed));

      void navigate({ to: '/chat' });
    } catch (e) {
      console.error(e);
      setError('root', { message: 'Failed to process mnemonic' });
    }
  };

  const formError = errors.mnemonic?.message ?? errors.root?.message;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <div className="max-w-md w-full p-6 bg-card border rounded-xl shadow-sm text-card-foreground">
        <h2 className="text-2xl font-bold mb-4 text-center">Nostr Chat Setup</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Enter your 24-word seed phrase or generate a new one. The seed is stored securely locally using IndexedDB.
        </p>

        <form onSubmit={handleSubmit(handleContinue)} className="space-y-4">
          <textarea
            className="w-full h-32 p-3 bg-input/50 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="word1 word2 word3..."
            {...register('mnemonic')}
          />

          {formError && <div className="text-destructive text-sm font-medium">{formError}</div>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleGenerate}>
              Generate New
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
