import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNostrManagerActions } from '@repo/nostr/react';
import { getConversationThreadKey, useAppSelector } from '../lib/chat-store';
import { Button } from '@repo/ui/components/ui/button';
import { useForm } from 'react-hook-form';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const chatMessageFormSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
});

type ChatMessageFormValues = z.infer<typeof chatMessageFormSchema>;

export function ChatWindow() {
  const { sendNip44Message } = useNostrManagerActions();
  const identities = useAppSelector((state) => state.chat.identities);
  const activeIdentityIndex = useAppSelector((state) => state.chat.activeIdentityIndex);
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

  const activeIdentity = identities.find((identity) => identity.index === activeIdentityIndex);

  if (!activeIdentity) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background rounded-lg border shadow-sm">
        <h3 className="text-xl font-semibold mb-2 text-foreground">No Chat Selected</h3>
        <p className="text-muted-foreground max-w-md">Tap + in the sidebar to add a chat and start messaging.</p>
      </div>
    );
  }

  const partnerKey = activeIdentity.activeChatPubKey;
  const chatTitle = activeIdentity.chatLabel ?? `Chat #${activeIdentity.index}`;

  if (!partnerKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background rounded-lg border shadow-sm">
        <h3 className="text-xl font-semibold mb-2 text-foreground">Chat Is Missing Contact Address</h3>
        <p className="text-muted-foreground max-w-md">Please recreate this chat from the sidebar.</p>
      </div>
    );
  }

  const conversationThreadKey = getConversationThreadKey({
    localPubKey: activeIdentity.publicKey,
    partnerPubKey: partnerKey,
  });
  const legacyConversation = (messages[partnerKey] ?? []).filter((msg) => {
    const localPubKey = msg.isOwn ? msg.senderPubKey : msg.recipientPubKey;
    return localPubKey.toLowerCase() === activeIdentity.publicKey.toLowerCase();
  });
  const conversation = messages[conversationThreadKey] ?? legacyConversation;

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
    <div className="flex h-full flex-col bg-background overflow-hidden relative">
      <div className="p-4 border-b border-border/60 bg-secondary/20 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{chatTitle}</h3>
          <p className="text-xs text-muted-foreground truncate max-w-[250px]">Partner: {partnerKey}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 bg-muted/[0.06]">
        {conversation.map((msg) => (
          <div key={msg.id} className={`flex w-full ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl ${
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

      <div className="p-4 bg-background border-t border-border/60">
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
