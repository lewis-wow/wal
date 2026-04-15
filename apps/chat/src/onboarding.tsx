import React from 'react';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@repo/bip39';
import { useAppDispatch } from './lib/chat-store';
import { setSeed } from './lib/chat-store';
import { Button } from '@repo/ui/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { saveSeed } from './lib/seed-vault';
import { nostrManager } from './lib/nostr-manager';

export function Onboarding() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [mnemonic, setMnemonic] = React.useState('');
  const [error, setError] = React.useState('');

  const handleGenerate = () => {
    const newMnemonic = generateMnemonic(256);
    setMnemonic(newMnemonic);
    setError('');
  };

  const handleContinue = async () => {
    try {
      if (!validateMnemonic(mnemonic)) {
        setError('Invalid mnemonic phrase');
        return;
      }

      const seed = mnemonicToSeed(mnemonic);
      await saveSeed(seed);
      dispatch(setSeed(seed));
      nostrManager.initialize({ seed });

      void navigate({ to: '/chat' });
    } catch (e) {
      console.error(e);
      setError('Failed to process mnemonic');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <div className="max-w-md w-full p-6 bg-card border rounded-xl shadow-sm text-card-foreground">
        <h2 className="text-2xl font-bold mb-4 text-center">Nostr Chat Setup</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Enter your 24-word seed phrase or generate a new one. The seed is stored securely locally using IndexedDB.
        </p>

        <div className="space-y-4">
          <textarea
            className="w-full h-32 p-3 bg-input/50 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="word1 word2 word3..."
            value={mnemonic}
            onChange={(e) => {
              setMnemonic(e.target.value);
              setError('');
            }}
          />

          {error && <div className="text-destructive text-sm font-medium">{error}</div>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleGenerate}>
              Generate New
            </Button>
            <Button className="flex-1" onClick={handleContinue} disabled={!mnemonic}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
