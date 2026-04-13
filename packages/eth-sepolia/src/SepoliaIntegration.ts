import { sepolia } from 'viem/chains';

import { EvmViemIntegration, type EvmViemIntegrationOptions } from './EvmViemIntegration.js';

export class SepoliaIntegration extends EvmViemIntegration {
  public constructor(options: EvmViemIntegrationOptions = {}) {
    super({
      chain: sepolia,
      name: 'Ethereum Sepolia',
      rpcUrl: options.rpcUrl,
    });
  }
}
