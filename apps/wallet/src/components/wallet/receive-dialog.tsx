import { Button } from '@repo/ui/components/ui/button';
import { ArrowDownLeft, Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { useWallet } from '../../lib/wallet-store';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type ReceiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: string;
};

type QRCodeProps = {
  value: string;
  size?: number;
};

const QRCode = ({ value, size = 180 }: QRCodeProps) => {
  const generatePattern = (str: string): boolean[][] => {
    const pattern: boolean[][] = [];
    const gridSize = 21;

    for (let i = 0; i < gridSize; i += 1) {
      const row: boolean[] = [];
      for (let j = 0; j < gridSize; j += 1) {
        const isPositionPattern = (i < 7 && j < 7) || (i < 7 && j >= gridSize - 7) || (i >= gridSize - 7 && j < 7);

        if (isPositionPattern) {
          const inOuter =
            i < 7 && j < 7
              ? i === 0 || i === 6 || j === 0 || j === 6
              : i < 7 && j >= gridSize - 7
                ? i === 0 || i === 6 || j === gridSize - 7 || j === gridSize - 1
                : i === gridSize - 7 || i === gridSize - 1 || j === 0 || j === 6;

          const inInner =
            i < 7 && j < 7
              ? i >= 2 && i <= 4 && j >= 2 && j <= 4
              : i < 7 && j >= gridSize - 7
                ? i >= 2 && i <= 4 && j >= gridSize - 5 && j <= gridSize - 3
                : i >= gridSize - 5 && i <= gridSize - 3 && j >= 2 && j <= 4;

          row.push(inOuter || inInner);
        } else {
          const hash = (str.charCodeAt((i * gridSize + j) % str.length) * 31 + i * 17 + j * 13) % 100;
          row.push(hash > 45);
        }
      }

      pattern.push(row);
    }

    return pattern;
  };

  const pattern = generatePattern(value);
  const cellSize = size / 25;
  const padding = cellSize * 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx={8} />
      {pattern.map((row, i) =>
        row.map((cell, j) =>
          cell ? (
            <rect
              key={`${i}-${j}`}
              x={padding + j * cellSize}
              y={padding + i * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null,
        ),
      )}
    </svg>
  );
};

export const ReceiveDialog = ({ open, onOpenChange, address }: ReceiveDialogProps) => {
  const { selectedAsset, selectedNetwork, selectedToken } = useWallet();
  const [copied, setCopied] = useState(false);

  const receiveAddress =
    address ??
    (selectedAsset.id === 'btc'
      ? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
      : '0x742d35Cc6634C0532925a3b844Bc9e7595f8aB3d');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(receiveAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5" />
            Receive {selectedToken.symbol}
          </DialogTitle>
          <DialogDescription>
            Scan QR code or copy address to receive {selectedToken.name} on {selectedNetwork.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <QRCode value={receiveAddress} size={180} />
          </div>

          <div className="w-full space-y-2">
            <p className="text-muted-foreground text-center text-xs font-medium">Your {selectedToken.symbol} Address</p>
            <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-3">
              <code className="flex-1 break-all text-xs">{receiveAddress}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {selectedToken.contractAddress ? (
            <div className="bg-muted/50 w-full rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Token Contract</p>
              <p className="font-mono text-xs">{selectedToken.contractAddress}</p>
            </div>
          ) : null}

          {selectedNetwork.isTestnet ? (
            <div className="w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
              <p className="text-center text-xs text-yellow-600">
                This is a testnet address. Only send testnet tokens.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-center">
          <Button variant="outline" className="gap-2" onClick={() => void handleCopy()}>
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Address
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
