import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Check, Copy, Settings } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

type WalletHeaderProps = {
  walletAddress?: string;
};

const shortenAddress = (value: string): string => {
  if (value.length < 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

export const WalletHeader = ({ walletAddress }: WalletHeaderProps) => {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!walletAddress) {
      return;
    }

    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground">W</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold">My Wallet</h1>
          <button
            onClick={() => {
              void copyAddress();
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {walletAddress ? shortenAddress(walletAddress) : 'Address not loaded'}
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Security and SLIP39</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Networks</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
