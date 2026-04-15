import { useAppDispatch, useAppSelector } from '../lib/chat-store';
import { addIdentity, setActiveChat } from '../lib/chat-store';
import { deriveFragmentedIdentity } from '@repo/nostr';
import { Button } from '@repo/ui/components/ui/button';
import { Plus, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function ChatSidebar() {
  const dispatch = useAppDispatch();
  const identities = useAppSelector((state) => state.chat.identities);
  const seed = useAppSelector((state) => state.chat.seed);

  const handleNewContact = () => {
    try {
      if (!seed) return;

      const nextIndex = identities.length > 0 ? Math.max(...identities.map((i) => i.index)) + 1 : 0;
      const { publicKey } = deriveFragmentedIdentity(seed, nextIndex);

      dispatch(
        addIdentity({
          index: nextIndex,
          publicKey,
        }),
      );
    } catch (e) {
      console.error('Failed to create contact', e);
    }
  };

  return (
    <div className="w-64 border-r bg-sidebar p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-sidebar-foreground">Identities</h2>
        <Button variant="ghost" size="icon" onClick={handleNewContact} disabled={!seed}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {identities.map((identity) => (
          <div
            key={identity.index}
            className="p-3 rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col gap-2"
          >
            <div className="text-sm font-medium">Session #{identity.index}</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground truncate" title={identity.publicKey}>
                {identity.publicKey.slice(0, 16)}...
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  void navigator.clipboard.writeText(identity.publicKey);
                  toast.success('Public key copied to clipboard');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Partner PubKey"
                className="flex-1 bg-input/50 border rounded px-2 py-1 text-xs"
                value={identity.activeChatPubKey ?? ''}
                onChange={(e) => dispatch(setActiveChat({ index: identity.index, contactPubKey: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
