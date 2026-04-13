import { Button } from '@repo/ui/components/ui/button';
import { Circle, Coins, Plus, Trash2, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { AddCustomNetworkInput, Network, Token } from '../../lib/wallet-context';
import { useWallet } from '../../lib/wallet-store';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const initialNetworkForm: AddCustomNetworkInput = {
  name: '',
  chainId: 1,
  rpcUrl: 'https://',
  nativeSymbol: 'ETH',
};

type AssetSwitcherProps = {
  onAddCustomNetwork: (input: AddCustomNetworkInput) => void;
  onRemoveCustomNetwork: (networkId: string) => void;
};

export const AssetSwitcher = ({ onAddCustomNetwork, onRemoveCustomNetwork }: AssetSwitcherProps) => {
  const {
    assets,
    selectedAsset,
    selectedNetwork,
    selectedToken,
    setSelectedAsset,
    setSelectedNetwork,
    setSelectedToken,
  } = useWallet();

  const [openAddNetwork, setOpenAddNetwork] = useState(false);
  const [networkForm, setNetworkForm] = useState<AddCustomNetworkInput>(initialNetworkForm);

  const handleAddNetwork = () => {
    onAddCustomNetwork(networkForm);
    setNetworkForm({
      name: '',
      chainId: networkForm.chainId + 1,
      rpcUrl: 'https://',
      nativeSymbol: 'ETH',
    });
    setOpenAddNetwork(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                {selectedAsset.icon}
              </span>
              {selectedAsset.symbol}
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Select Chain</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {assets.map((asset) => (
              <DropdownMenuItem key={asset.id} onClick={() => setSelectedAsset(asset)} className="gap-2">
                <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                  {asset.icon}
                </span>
                <span className="flex-1">{asset.name}</span>
                {selectedAsset.id === asset.id ? <Circle className="fill-primary text-primary h-2 w-2" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <span className={`h-2 w-2 rounded-full ${selectedNetwork.isTestnet ? 'bg-amber-500' : 'bg-green-500'}`} />
              {selectedNetwork.name.replace(' Mainnet', '').replace(' Testnet', '')}
              {selectedNetwork.isTestnet ? (
                <Badge variant="secondary" className="ml-1 text-xs">
                  Testnet
                </Badge>
              ) : null}
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Select Network</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {selectedAsset.networks.map((network: Network) => (
              <DropdownMenuItem key={network.id} onClick={() => setSelectedNetwork(network)} className="gap-2">
                <span className={`h-2 w-2 rounded-full ${network.isTestnet ? 'bg-amber-500' : 'bg-green-500'}`} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>{network.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{network.rpcUrl}</span>
                </div>
                {network.isTestnet ? (
                  <Badge variant="outline" className="text-xs">
                    Test
                  </Badge>
                ) : null}
                {network.kind === 'custom' ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveCustomNetwork(network.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove network"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
                {selectedNetwork.id === network.id ? <Circle className="fill-primary text-primary h-2 w-2" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedNetwork.tokens.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Coins className="h-4 w-4" />
                {selectedToken.symbol}
                {selectedToken.contractAddress ? (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    ERC-20
                  </Badge>
                ) : null}
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Select Token</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {selectedNetwork.tokens.map((token: Token) => (
                <DropdownMenuItem key={token.id} onClick={() => setSelectedToken(token)} className="gap-2">
                  <Coins className="text-muted-foreground h-4 w-4" />
                  <div className="flex-1">
                    <span className="font-medium">{token.symbol}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{token.name}</span>
                  </div>
                  {token.contractAddress ? (
                    <Badge variant="outline" className="text-xs">
                      ERC-20
                    </Badge>
                  ) : null}
                  {selectedToken.id === token.id ? <Circle className="fill-primary text-primary h-2 w-2" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Button variant="outline" className="gap-2" onClick={() => setOpenAddNetwork(true)}>
          <Plus className="h-4 w-4" />
          Add EVM Network
        </Button>
      </div>

      <Dialog open={openAddNetwork} onOpenChange={setOpenAddNetwork}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add EVM Network</DialogTitle>
            <DialogDescription>Add any EVM-compatible chain by RPC URL and Chain ID.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="network-name">Network Name</Label>
              <Input
                id="network-name"
                value={networkForm.name}
                onChange={(event) => setNetworkForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Base Sepolia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-chain-id">Chain ID</Label>
              <Input
                id="network-chain-id"
                type="number"
                value={networkForm.chainId}
                onChange={(event) =>
                  setNetworkForm((current) => ({
                    ...current,
                    chainId: Number(event.target.value),
                  }))
                }
                placeholder="84532"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-rpc">RPC URL</Label>
              <Input
                id="network-rpc"
                value={networkForm.rpcUrl}
                onChange={(event) => setNetworkForm((current) => ({ ...current, rpcUrl: event.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-symbol">Native Symbol</Label>
              <Input
                id="network-symbol"
                value={networkForm.nativeSymbol}
                onChange={(event) =>
                  setNetworkForm((current) => ({
                    ...current,
                    nativeSymbol: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="ETH"
              />
            </div>
            <Button type="button" className="w-full" onClick={handleAddNetwork}>
              Add Network
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
