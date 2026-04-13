import { Card, CardContent } from '../ui/card';
import { Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useWallet } from '../../lib/wallet-store';

export const WalletBalance = () => {
  const { selectedToken } = useWallet();
  const [showBalance, setShowBalance] = useState(true);

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Balance</span>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2">
          <h2 className="text-4xl font-bold tracking-tight">{showBalance ? selectedToken.value : '••••••'}</h2>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={`flex items-center gap-1 ${selectedToken.positive ? 'text-green-600' : 'text-red-500'}`}>
              <TrendingUp className="h-4 w-4" />
              {selectedToken.change}
            </span>
            <span className="text-muted-foreground">Today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
