import React from 'react';
import { useNostrManagerActions } from '@repo/nostr/react';
import { useAppDispatch, useAppSelector } from '../lib/chat-store';
import { setIdentities } from '../lib/chat-store';
import { Button } from '@repo/ui/components/ui/button';
import { Shield, Eye, EyeOff, Search, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { bytesToHex } from '@repo/utils';

const DISCOVERY_GAP_LIMIT = 20;
const DISCOVERY_BATCH_SIZE = 20;

type DiscoveryUiProgress = {
  scannedCount: number;
  emptyCount: number;
};

export function SecurityDashboard() {
  const dispatch = useAppDispatch();
  const { discoverIdentities } = useNostrManagerActions();
  const identities = useAppSelector((state) => state.chat.identities);
  const seed = useAppSelector((state) => state.chat.seed);

  const [showSeed, setShowSeed] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchMsg, setSearchMsg] = React.useState('');
  const [discoveryProgress, setDiscoveryProgress] = React.useState<DiscoveryUiProgress | null>(null);

  const emptyStreakPercent = discoveryProgress
    ? Math.min(100, Math.round((discoveryProgress.emptyCount / DISCOVERY_GAP_LIMIT) * 100))
    : 0;

  const handleDiscovery = () => {
    if (!seed || isSearching) return;

    setIsSearching(true);
    setDiscoveryProgress({ scannedCount: 0, emptyCount: 0 });
    setSearchMsg('Scanning relays for blinded identities...');

    void discoverIdentities({
      seed,
      gapLimit: DISCOVERY_GAP_LIMIT,
      relayQueryMaxWaitMs: 1200,
      discoveryBatchSize: DISCOVERY_BATCH_SIZE,
      onProgress: (progress) => {
        dispatch(setIdentities(progress.discovered));
        setDiscoveryProgress({
          scannedCount: progress.scannedCount,
          emptyCount: progress.emptyCount,
        });

        if (!progress.done) {
          setSearchMsg(
            `Scanning... checked ${progress.scannedCount} addresses, current empty streak ${progress.emptyCount}/${DISCOVERY_GAP_LIMIT}.`,
          );
        }
      },
    })
      .then((discovered) => {
        if (discovered.length > 0) {
          setSearchMsg(`Found and recovered ${discovered.length} identities.`);
        } else {
          setSearchMsg('No active identities found.');
        }
      })
      .catch((err) => {
        console.error(err);
        setSearchMsg('Recovery failed. See console.');
      })
      .finally(() => {
        setIsSearching(false);
      });
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-card border rounded-xl shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Security Dashboard</h2>
      </div>

      <div className="space-y-6">
        <div className="p-4 bg-muted/30 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Master Seed</h3>
            <Button variant="outline" size="sm" onClick={() => setShowSeed(!showSeed)}>
              {showSeed ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showSeed ? 'Hide' : 'Reveal'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Your seed is used to deterministically derive all fragmented identities and blinding factors. It is stored
            locally within the browser IndexedDB.
          </p>
          <div
            className={`p-3 bg-background border rounded font-mono text-sm break-all ${!showSeed && 'blur-sm transition-all select-none'}`}
          >
            {seed ? bytesToHex(seed) : 'No seed in memory'}
          </div>
        </div>

        <div className="p-4 bg-muted/30 border rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-foreground">Identity Recovery</h3>
              <p className="text-sm text-muted-foreground">
                Scan relays to recover previously used chat identities up to the gap limit.
              </p>
            </div>
            <Button onClick={handleDiscovery} disabled={isSearching || !seed} className="shrink-0">
              <Search className={`w-4 h-4 mr-2 ${isSearching && 'animate-spin'}`} />
              {isSearching ? 'Scanning...' : 'Run Discovery'}
            </Button>
          </div>
          {searchMsg && <div className="text-sm font-medium text-primary mt-2">{searchMsg}</div>}

          {isSearching && discoveryProgress ? (
            <div className="mt-3 rounded-md border bg-background/80 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Running discovery in background</span>
                </div>
                <span>{discoveryProgress.scannedCount} checked</span>
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${emptyStreakPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Empty streak progress to stop condition</span>
                <span className="font-medium text-foreground">
                  {discoveryProgress.emptyCount}/{DISCOVERY_GAP_LIMIT}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 bg-muted/30 border rounded-lg">
          <h3 className="font-semibold text-foreground mb-4">Current Derivation Sequence</h3>
          {identities.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No identities derived yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {identities.map((id) => (
                <div
                  key={id.index}
                  className="px-3 py-2 bg-background border rounded text-xs flex justify-between items-center group"
                >
                  <div>
                    <span className="font-medium">#{id.index}</span>
                    <span className="text-muted-foreground truncate ml-2">{id.publicKey.slice(0, 16)}...</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      void navigator.clipboard.writeText(id.publicKey);
                      toast.success('Public key copied to clipboard');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
