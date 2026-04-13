import { Button } from '@repo/ui/components/ui/button';
import { AlertCircle, ArrowUpRight, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useWallet } from '../../lib/wallet-store';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

type SendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSending?: boolean;
  initialRecipient?: string;
  onSend: (payload: { recipient: string; amount: string }) => Promise<void>;
};

export const SendDialog = ({ open, onOpenChange, isSending = false, initialRecipient, onSend }: SendDialogProps) => {
  const { selectedToken, selectedNetwork } = useWallet();
  const [recipient, setRecipient] = useState(initialRecipient ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const availableBalance = Number.parseFloat(selectedToken.balance) || 0;
  const enteredAmount = Number.parseFloat(amount) || 0;
  const isValidAmount = enteredAmount > 0 && enteredAmount <= availableBalance;
  const isValidRecipient = recipient.length > 0;

  const handleMaxClick = () => {
    setAmount(selectedToken.balance);
  };

  const handleSend = async () => {
    if (!isValidAmount || !isValidRecipient || isSending) {
      return;
    }

    setError('');
    try {
      await onSend({ recipient, amount });
      setRecipient('');
      setAmount('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send transaction.');
    }
  };

  const handleClose = () => {
    setRecipient(initialRecipient ?? '');
    setAmount('');
    setError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            Send {selectedToken.symbol}
          </DialogTitle>
          <DialogDescription>
            Send {selectedToken.name} on {selectedNetwork.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder={`Enter ${selectedToken.symbol} address`}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Amount</Label>
              <span className="text-xs text-muted-foreground">
                Available: {selectedToken.balance} {selectedToken.symbol}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="pr-16 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {selectedToken.symbol}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleMaxClick}>
                Max
              </Button>
            </div>
            {enteredAmount > availableBalance ? (
              <p className="text-destructive flex items-center gap-1 text-xs">
                <AlertCircle className="h-3 w-3" />
                Insufficient balance
              </p>
            ) : null}
          </div>

          {selectedToken.contractAddress ? (
            <div className="bg-muted/50 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Token Contract</p>
              <p className="font-mono text-xs">{selectedToken.contractAddress}</p>
            </div>
          ) : null}

          {error ? (
            <div className="border-destructive bg-destructive/10 flex items-center gap-2 rounded-lg border p-3">
              <AlertCircle className="text-destructive h-4 w-4" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSend()} disabled={!isValidAmount || !isValidRecipient || isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>Send {selectedToken.symbol}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
