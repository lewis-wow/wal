import { Button } from '@repo/ui/components/ui/button';
import { ArrowDownLeft, ArrowUpRight, QrCode } from 'lucide-react';

type WalletActionsProps = {
  onSend: () => void;
  onReceive: () => void;
  onScan: () => void;
};

export const WalletActions = ({ onSend, onReceive, onScan }: WalletActionsProps) => {
  const actions = [
    { icon: ArrowUpRight, label: 'Send', onClick: onSend },
    { icon: ArrowDownLeft, label: 'Receive', onClick: onReceive },
    { icon: QrCode, label: 'Scan', onClick: onScan },
  ];

  return (
    <div className="mt-6 grid grid-cols-3 gap-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className="flex h-auto flex-col gap-2 py-4"
          onClick={action.onClick}
        >
          <action.icon className="h-5 w-5" />
          <span className="text-xs">{action.label}</span>
        </Button>
      ))}
    </div>
  );
};
