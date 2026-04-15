import React from 'react';
import { useAppSelector } from '../lib/chat-store';
import { nostrManager } from '../lib/nostr-manager';
import { Button } from '@repo/ui/components/ui/button';
import { Send, Lock } from 'lucide-react';
import { toast } from 'sonner';

export function ChatWindow() {
  const [inputText, setInputText] = React.useState('');
  const identities = useAppSelector((state) => state.chat.identities);
  const messages = useAppSelector((state) => state.chat.messages);

  const activeIdentity = identities.find((i) => Boolean(i.activeChatPubKey));

  if (!activeIdentity || !activeIdentity.activeChatPubKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background rounded-lg border shadow-sm">
        <Lock className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-xl font-semibold mb-2 text-foreground">Blinded Chat</h3>
        <p className="text-muted-foreground max-w-md">
          Select an identity from the sidebar and input a partner's public key to start an end-to-end encrypted
          conversation.
        </p>
      </div>
    );
  }

  const partnerKey = activeIdentity.activeChatPubKey;
  const conversation = messages[partnerKey] ?? [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      await nostrManager.sendNip44Message({
        identityIndex: activeIdentity.index,
        contactPubKey: partnerKey,
        message: inputText,
      });
      setInputText('');
    } catch (err: any) {
      console.error('Failed to send message', err);
      toast.error(err.message || 'Failed to send message');
    }
  };

  return (
    <div className="flex-1 flex flex-col border rounded-lg bg-background overflow-hidden relative shadow-sm">
      <div className="p-4 border-b bg-secondary/30 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Encrypted Session</h3>
          <p className="text-xs text-muted-foreground truncate max-w-[250px]">Partner: {partnerKey}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 bg-muted/10">
        {conversation.map((msg) => (
          <div key={msg.id} className={`flex max-w-[80%] ${msg.isOwn ? 'ml-auto' : ''}`}>
            <div
              className={`px-4 py-2 rounded-2xl ${
                msg.isOwn
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-secondary text-secondary-foreground rounded-bl-sm border border-border/50'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              <div className="text-[10px] opacity-70 mt-1 text-right">
                {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-background border-t">
        <form onSubmit={handleSend} className="flex gap-2 relative">
          <input
            type="text"
            className="flex-1 bg-input/50 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Type an encrypted message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Button type="submit" size="icon" className="rounded-full shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
