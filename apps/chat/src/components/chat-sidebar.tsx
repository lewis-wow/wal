import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAppDispatch, useAppSelector } from '../lib/chat-store';
import { addIdentity, linkIdentityToChat, setActiveIdentity, updateChatLabel } from '../lib/chat-store';
import { deriveFragmentedIdentity } from '@repo/nostr';
import { Button } from '@repo/ui/components/ui/button';
import { Copy, Pencil, Plus, QrCode, Share2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { toast } from 'sonner';

const HEX_PUBKEY_REGEX = /^[a-fA-F0-9]{64}$/u;

const normalizeContactPubKey = (rawValue: string): string | null => {
  const trimmedValue = rawValue.trim();

  if (HEX_PUBKEY_REGEX.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }

  const withoutNostrPrefix = trimmedValue.toLowerCase().startsWith('nostr:') ? trimmedValue.slice(6) : trimmedValue;

  if (!withoutNostrPrefix.toLowerCase().startsWith('npub')) {
    return null;
  }

  try {
    const decoded = nip19.decode(withoutNostrPrefix);
    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      return null;
    }

    return HEX_PUBKEY_REGEX.test(decoded.data) ? decoded.data.toLowerCase() : null;
  } catch {
    return null;
  }
};

const addChatFormSchema = z.object({
  chatLabel: z.string().trim().min(1, 'Label is required').max(60, 'Label must be 60 characters or fewer'),
  partnerPubKey: z
    .string()
    .trim()
    .min(1, 'Contact address is required')
    .refine((value) => normalizeContactPubKey(value) !== null, 'Enter a valid address (hex, npub, or nostr:npub)'),
});

type AddChatFormValues = z.infer<typeof addChatFormSchema>;

const renameChatFormSchema = z.object({
  chatLabel: z.string().trim().min(1, 'Label is required').max(60, 'Label must be 60 characters or fewer'),
});

type RenameChatFormValues = z.infer<typeof renameChatFormSchema>;

export function ChatSidebar() {
  const dispatch = useAppDispatch();
  const identities = useAppSelector((state) => state.chat.identities);
  const activeIdentityIndex = useAppSelector((state) => state.chat.activeIdentityIndex);
  const seed = useAppSelector((state) => state.chat.seed);
  const [isAddChatOpen, setIsAddChatOpen] = React.useState(false);
  const [isShareOpen, setIsShareOpen] = React.useState(false);
  const [isRenameChatOpen, setIsRenameChatOpen] = React.useState(false);
  const [shareLink, setShareLink] = React.useState('');
  const [shareQrDataUrl, setShareQrDataUrl] = React.useState('');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddChatFormValues>({
    resolver: zodResolver(addChatFormSchema),
    mode: 'onSubmit',
    defaultValues: {
      chatLabel: '',
      partnerPubKey: '',
    },
  });

  const {
    register: registerRename,
    handleSubmit: handleSubmitRename,
    reset: resetRename,
    setValue: setRenameValue,
    formState: { errors: renameErrors, isSubmitting: isRenaming },
  } = useForm<RenameChatFormValues>({
    resolver: zodResolver(renameChatFormSchema),
    mode: 'onSubmit',
    defaultValues: {
      chatLabel: '',
    },
  });

  const handleAddChat = (values: AddChatFormValues) => {
    try {
      if (!seed) {
        setError('root', { message: 'Seed is missing. Please re-run onboarding.' });
        return;
      }

      const normalizedPartnerPubKey = normalizeContactPubKey(values.partnerPubKey);
      if (!normalizedPartnerPubKey) {
        setError('partnerPubKey', { message: 'Enter a valid address (hex, npub, or nostr:npub)' });
        return;
      }

      const unassignedIdentity = identities.find((identity) => !identity.activeChatPubKey);

      if (unassignedIdentity) {
        dispatch(
          linkIdentityToChat({
            index: unassignedIdentity.index,
            contactPubKey: normalizedPartnerPubKey,
            chatLabel: values.chatLabel.trim(),
          }),
        );
      } else {
        const nextIndex = identities.length > 0 ? Math.max(...identities.map((i) => i.index)) + 1 : 0;
        const { publicKey } = deriveFragmentedIdentity(seed, nextIndex);

        dispatch(
          addIdentity({
            index: nextIndex,
            publicKey,
            activeChatPubKey: normalizedPartnerPubKey,
            chatLabel: values.chatLabel.trim(),
          }),
        );

        dispatch(setActiveIdentity({ index: nextIndex }));
      }

      reset();
      setIsAddChatOpen(false);
      toast.success('Chat added');
    } catch (e) {
      console.error('Failed to add chat', e);
      setError('root', { message: 'Failed to add chat' });
    }
  };

  const formError = errors.chatLabel?.message ?? errors.partnerPubKey?.message ?? errors.root?.message;
  const chatIdentities = identities.filter((identity) => Boolean(identity.activeChatPubKey));
  const activeChatIdentity = chatIdentities.find((identity) => identity.index === activeIdentityIndex);
  const renameFormError = renameErrors.chatLabel?.message;

  const generateSharedAddress = React.useCallback(() => {
    if (!seed) {
      toast.error('Seed is missing. Please re-run onboarding.');
      return;
    }

    const nextIndex = identities.length > 0 ? Math.max(...identities.map((identity) => identity.index)) + 1 : 0;
    const { publicKey } = deriveFragmentedIdentity(seed, nextIndex);

    dispatch(
      addIdentity({
        index: nextIndex,
        publicKey,
      }),
    );

    const npub = nip19.npubEncode(publicKey);
    const generatedShareLink = `nostr:${npub}`;
    setShareLink(generatedShareLink);

    void QRCode.toDataURL(generatedShareLink, {
      width: 220,
      margin: 1,
    })
      .then((dataUrl: string) => {
        setShareQrDataUrl(dataUrl);
      })
      .catch((error: unknown) => {
        console.error('Failed to generate share QR code', error);
        setShareQrDataUrl('');
      });
  }, [dispatch, identities, seed]);

  React.useEffect(() => {
    if (!isShareOpen || shareLink) {
      return;
    }

    generateSharedAddress();
  }, [generateSharedAddress, isShareOpen, shareLink]);

  React.useEffect(() => {
    if (!isRenameChatOpen) {
      return;
    }

    if (!activeChatIdentity) {
      setIsRenameChatOpen(false);
      return;
    }

    setRenameValue('chatLabel', activeChatIdentity.chatLabel ?? `Chat #${activeChatIdentity.index}`, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [activeChatIdentity, isRenameChatOpen, setRenameValue]);

  const handleRenameChat = (values: RenameChatFormValues) => {
    if (!activeChatIdentity) {
      return;
    }

    dispatch(
      updateChatLabel({
        index: activeChatIdentity.index,
        chatLabel: values.chatLabel.trim(),
      }),
    );
    setIsRenameChatOpen(false);
    resetRename();
    toast.success('Chat label updated');
  };

  return (
    <div className="w-72 border-r bg-sidebar p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-sidebar-foreground">Chats</h2>
        <div className="flex items-center gap-1">
          <Dialog.Root
            open={isRenameChatOpen}
            onOpenChange={(open) => {
              setIsRenameChatOpen(open);
              if (!open) {
                resetRename();
              }
            }}
          >
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" disabled={!activeChatIdentity}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
                <Dialog.Title className="text-lg font-semibold text-foreground">Rename Chat</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  Update the local label for the selected chat.
                </Dialog.Description>

                <form onSubmit={handleSubmitRename(handleRenameChat)} className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Label</label>
                    <input
                      type="text"
                      placeholder="Chat label"
                      className="w-full rounded-md border bg-input/50 px-3 py-2 text-sm"
                      {...registerRename('chatLabel')}
                    />
                  </div>

                  {renameFormError && <p className="text-sm font-medium text-destructive">{renameFormError}</p>}

                  <div className="flex justify-end gap-2 pt-2">
                    <Dialog.Close asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button type="submit" disabled={isRenaming || !activeChatIdentity}>
                      Save
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <Dialog.Root
            open={isShareOpen}
            onOpenChange={(open) => {
              setIsShareOpen(open);
              if (!open) {
                setShareLink('');
                setShareQrDataUrl('');
              }
            }}
          >
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" disabled={!seed}>
                <Share2 className="h-4 w-4" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
                <Dialog.Title className="text-lg font-semibold text-foreground">Share New Address</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  A fresh address is generated automatically and can be shared as a link or QR code.
                </Dialog.Description>

                <div className="mt-4 space-y-3">
                  <div className="rounded-md border bg-muted/30 p-3 text-xs break-all min-h-16">
                    {shareLink || 'Generating share link...'}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={!shareLink}
                      onClick={() => {
                        if (!shareLink) return;
                        void navigator.clipboard.writeText(shareLink);
                        toast.success('Share link copied');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-card p-4 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                      <QrCode className="h-4 w-4" />
                      QR Code
                    </div>
                    {shareQrDataUrl ? (
                      <img
                        src={shareQrDataUrl}
                        alt="Share address QR"
                        className="h-52 w-52 rounded-md border bg-white p-2"
                      />
                    ) : (
                      <div className="h-52 w-52 rounded-md border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                        Preparing QR...
                      </div>
                    )}
                  </div>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <Dialog.Root open={isAddChatOpen} onOpenChange={setIsAddChatOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" disabled={!seed}>
                <Plus className="h-4 w-4" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
                <Dialog.Title className="text-lg font-semibold text-foreground">Add Chat</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  Add a local label and your contact&apos;s address.
                </Dialog.Description>

                <form onSubmit={handleSubmit(handleAddChat)} className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Label</label>
                    <input
                      type="text"
                      placeholder="Alice"
                      className="w-full rounded-md border bg-input/50 px-3 py-2 text-sm"
                      {...register('chatLabel')}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Contact Address</label>
                    <input
                      type="text"
                      placeholder="hex, npub, or nostr:npub"
                      className="w-full rounded-md border bg-input/50 px-3 py-2 text-sm"
                      {...register('partnerPubKey')}
                    />
                  </div>

                  {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}

                  <div className="flex justify-end gap-2 pt-2">
                    <Dialog.Close asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button type="submit" disabled={isSubmitting}>
                      Add Chat
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {chatIdentities.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No chats yet. Tap + to add one.</p>
        ) : (
          chatIdentities.map((identity) => {
            const isActive = identity.index === activeIdentityIndex;

            return (
              <button
                type="button"
                key={identity.index}
                className={`w-full rounded-lg border p-3 text-left shadow-sm transition-colors ${
                  isActive ? 'bg-primary/10 border-primary/40' : 'bg-card hover:bg-card/80'
                }`}
                onClick={() => dispatch(setActiveIdentity({ index: identity.index }))}
              >
                <p className="text-sm font-medium text-card-foreground">
                  {identity.chatLabel ?? `Chat #${identity.index}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {identity.activeChatPubKey
                    ? `${identity.activeChatPubKey.slice(0, 16)}...`
                    : 'Missing contact address'}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
