export interface ChainRpcConfig {
  name: string;
  rpcUrls: string[];
  isTestnet: boolean;
}

export const CHAIN_RPC_MAPPING: Record<number, ChainRpcConfig> = {
  // ─── Ethereum ──────────────────────────────────────────
  1: {
    name: 'Ethereum Mainnet',
    rpcUrls: [
      'https://eth.llamarpc.com',
      'https://cloudflare-eth.com',
      'https://ethereum-rpc.publicnode.com',
      'https://mainnet.gateway.tenderly.co',
    ],
    isTestnet: false,
  },
  11155111: {
    name: 'Ethereum Sepolia',
    rpcUrls: [
      'https://rpc.sepolia.org',
      'https://rpc2.sepolia.org',
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
    ],
    isTestnet: true,
  },
  17000: {
    name: 'Ethereum Holesky',
    rpcUrls: ['https://rpc.holesky.ethpandaops.io'],
    isTestnet: true,
  },

  // ─── Base ──────────────────────────────────────────────
  8453: {
    name: 'Base Mainnet',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.gateway.tenderly.co',
      'https://base-rpc.publicnode.com',
    ],
    isTestnet: false,
  },
  84532: {
    name: 'Base Sepolia',
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
    ],
    isTestnet: true,
  },

  // ─── Arbitrum ──────────────────────────────────────────
  42161: {
    name: 'Arbitrum One',
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
    ],
    isTestnet: false,
  },
  421614: {
    name: 'Arbitrum Sepolia',
    rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
    isTestnet: true,
  },

  // ─── Polygon ───────────────────────────────────────────
  137: {
    name: 'Polygon Mainnet',
    rpcUrls: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon.drpc.org',
      'https://polygon-rpc.com',
    ],
    isTestnet: false,
  },
  80002: {
    name: 'Polygon Amoy',
    rpcUrls: [
      'https://rpc-amoy.polygon.technology',
      'https://polygon-amoy-bor-rpc.publicnode.com',
    ],
    isTestnet: true,
  },

  // ─── Optimism ──────────────────────────────────────────
  10: {
    name: 'OP Mainnet',
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
      'https://optimism.drpc.org',
    ],
    isTestnet: false,
  },
  11155420: {
    name: 'OP Sepolia',
    rpcUrls: [
      'https://sepolia.optimism.io',
      'https://optimism-sepolia.drpc.org',
    ],
    isTestnet: true,
  },

  // ─── BSC ───────────────────────────────────────────────
  56: {
    name: 'BNB Smart Chain',
    rpcUrls: [
      'https://bsc-dataseed1.bnbchain.org',
      'https://bsc-dataseed2.bnbchain.org',
      'https://bsc-rpc.publicnode.com',
    ],
    isTestnet: false,
  },
  97: {
    name: 'BSC Testnet',
    rpcUrls: [
      'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      'https://bsc-testnet-rpc.publicnode.com',
    ],
    isTestnet: true,
  },

  // ─── Avalanche ─────────────────────────────────────────
  43114: {
    name: 'Avalanche C-Chain',
    rpcUrls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-c-chain-rpc.publicnode.com',
    ],
    isTestnet: false,
  },
  43113: {
    name: 'Avalanche Fuji',
    rpcUrls: [
      'https://api.avax-test.network/ext/bc/C/rpc',
      'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    ],
    isTestnet: true,
  },

  // ─── Linea ─────────────────────────────────────────────
  59144: {
    name: 'Linea Mainnet',
    rpcUrls: [
      'https://rpc.linea.build',
      'https://linea-rpc.publicnode.com',
    ],
    isTestnet: false,
  },
  59141: {
    name: 'Linea Sepolia',
    rpcUrls: [
      'https://rpc.sepolia.linea.build',
      'https://linea-sepolia-rpc.publicnode.com',
    ],
    isTestnet: true,
  },
};
