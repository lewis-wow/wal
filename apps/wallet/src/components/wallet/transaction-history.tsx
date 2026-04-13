import { useWallet } from '../../lib/wallet-store';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

type TransactionHistoryProps = {
  latestTransactionHash?: string;
};

const baseTransactions = [
  {
    id: 1,
    type: 'receive',
    asset: 'ETH',
    amount: '+1.2',
    value: '1.2 ETH',
    time: '2 days ago',
  },
] as const;

const getIcon = (type: string) => {
  switch (type) {
    case 'send':
      return <ArrowUpRight className="h-4 w-4" />;
    case 'receive':
      return <ArrowDownLeft className="h-4 w-4" />;
    default:
      return null;
  }
};

const getIconBg = (type: string) => {
  switch (type) {
    case 'send':
      return 'bg-red-100 text-red-600';
    case 'receive':
      return 'bg-green-100 text-green-600';
    default:
      return 'bg-muted';
  }
};

export const TransactionHistory = ({ latestTransactionHash }: TransactionHistoryProps) => {
  const { selectedToken } = useWallet();
  const transactions = latestTransactionHash
    ? [
        {
          id: `latest-${latestTransactionHash}`,
          type: 'send',
          asset: selectedToken.symbol,
          amount: 'Submitted',
          value: latestTransactionHash.slice(0, 12),
          time: 'Just now',
        },
        ...baseTransactions,
      ]
    : baseTransactions;

  return (
    <Card className="mb-8 mt-6">
      <CardHeader>
        <CardTitle className="text-base">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex cursor-pointer items-center justify-between rounded-lg p-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${getIconBg(tx.type)}`}>
                {getIcon(tx.type)}
              </div>
              <div>
                <p className="font-medium capitalize">{tx.type}</p>
                <p className="text-sm text-muted-foreground">{tx.time}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">
                {tx.amount} {tx.asset}
              </p>
              <p className="text-sm text-muted-foreground">{tx.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
