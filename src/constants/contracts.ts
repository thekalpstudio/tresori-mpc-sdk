// Chain-specific ERC20Facilitator contract addresses
export const FACILITATOR_BY_CHAIN: Record<number, string> = {
  84532: '0xaB3Ba4CE9cBC5844be6630670395a77F4a5A70c7',   // Base Sepolia
  11155111: '0x1B8BD1589a4C6147c06c9cA6731eDD00d13AE78f', // Ethereum Sepolia
  8453: '0x9657C59322370856872a62BB6CEE8EE220330bcF',     // Base Mainnet
  97: '0x1ad8c3B424fC925D75CCFE8dA049A4c245bFa913',       // BSC Testnet
  80002: '0xDF5035b90a6eEE4096cDBB6429F2204f2BFeD05c',    // Polygon Amoy
  11155420: '0x1ad8c3B424fC925D75CCFE8dA049A4c245bFa913', // OP Sepolia
  421614: '0x1ad8c3B424fC925D75CCFE8dA049A4c245bFa913',   // Arbitrum Sepolia
  43113: '0x1ad8c3B424fC925D75CCFE8dA049A4c245bFa913',    // Avalanche Fuji
  1: '0x154674cA71510a4Dc52271A96A81D8dC9B88C43B',        // Ethereum Mainnet
};

// Chain-specific Relayer contract addresses
export const RELAYER_BY_CHAIN: Record<number, string> = {
  84532: '0x7d7Ef84ed6cAE00554607ae119B8FB7F286EC342',   // Base Sepolia
  11155111: '0xfC9aa13f0f1c436E20e0d970Ed076A054C563699', // Ethereum Sepolia
  8453: '0xE3706A4fA7878c68D797012B6b6AF6f7a7f7D0B8',     // Base Mainnet
  97: '0x7d7Ef84ed6cAE00554607ae119B8FB7F286EC342',       // BSC Testnet
  80002: '0xB9CBD815098cc3d6A348bDfed995af91e2298d6D',    // Polygon Amoy
  11155420: '0x7d7Ef84ed6cAE00554607ae119B8FB7F286EC342', // OP Sepolia
  421614: '0x7d7Ef84ed6cAE00554607ae119B8FB7F286EC342',   // Arbitrum Sepolia
  43113: '0x7d7Ef84ed6cAE00554607ae119B8FB7F286EC342',    // Avalanche Fuji
  1: '0xf3772B0245E42e45c316aef1f9AFF3182df4FB27',        // Ethereum Mainnet
};

// Default fee recipient for gasless transactions
export const DEFAULT_FEE_RECIPIENT = '0x663046eAd467db63FFCB3974e187e6C8F60D639B';

// Default sponsor address
export const DEFAULT_SPONSOR_ADDRESS = '0xd22fb5ce742c5b293e34070d9f93a50590e7cc41';

// Default relay API URL
export const DEFAULT_RELAY_API_URL = 'https://alpha-wallet-api.kalp.studio/relayer/relay';

// Default API base URL
export const DEFAULT_API_BASE_URL = 'https://alpha-wallet-api.kalp.studio';
