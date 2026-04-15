import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNostrManagerActions } from '@repo/nostr/react';
import { useAppSelector } from '../lib/chat-store';
import { Button } from '@repo/ui/components/ui/button';
import { useForm } from 'react-hook-form';
import { Send, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const chatMessageFormSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
});

type ChatMessageFormValues = z.infer<typeof chatMessageFormSchema>;

export function ChatWindow() {
  const { sendNip44Message } = useNostrManagerActions();
  const identities = useAppSelector((state) => state.chat.identities);
  const messages = useAppSelector((state) => state.chat.messages);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChatMessageFormValues>({
    resolver: zodResolver(chatMessageFormSchema),
    mode: 'onSubmit',
    defaultValues: {
      message: '',
    },
  });

  const activeIdentity = identities.find((i) => Boolean(i.activeChatPubKey));

  if (!activeIdentity || !activeIdentity.activeChatPubKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background rounded-lg border shadow-sm">
        <Lock className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-xl font-semibold mb-2 text-foreground">Blinded Chat</h3>
        <p className="text-muted-foreground max-w-md">
          Select an identity from the sidebar and input a partner&apos;s public key to start an end-to-end encrypted
          conversation.
        </p>
      </div>
    );
  }

  const partnerKey = activeIdentity.activeChatPubKey;
  const conversation = messages[partnerKey] ?? [];

  const handleSend = async (values: ChatMessageFormValues) => {
    try {
      await sendNip44Message({
        identityIndex: activeIdentity.index,
        contactPubKey: partnerKey,
        message: values.message,
      });
      reset();
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError('root', { message: errMessage });
      console.error('Failed to send message', err);
      toast.error(errMessage);
    }
  };

  const formError = errors.message?.message ?? errors.root?.message;

  return (
    <div className="flex-1 flex flex-col border rounded-lg bg-background overflow-hidden relative shadow-sm">
      <div className="p-4 border-b bg-secondary/30 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Encrypted Session</h3>
          <p className="text-xs text-muted-foreground truncate max-w-62.5">Partner: {partnerKey}</p>
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
        <form onSubmit={handleSubmit(handleSend)} className="space-y-2">
          <div className="flex gap-2 relative">
            <input
              type="text"
              className="flex-1 bg-input/50 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Type an encrypted message..."
              {...register('message')}
            />
            <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={isSubmitting}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
          {formError && <div className="text-destructive text-xs font-medium">{formError}</div>}
        </form>
      </div>
    </div>
  );
}
