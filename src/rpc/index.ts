import { CHAIN_RPC_MAPPING } from '../constants/rpc';

export async function rpcCall(
  method: string,
  params: unknown[],
  chainId: number,
  rpcUrl?: string
): Promise<string> {
  const url = rpcUrl || getRpcUrl(chainId);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export function getRpcUrl(chainId: number): string {
  const config = CHAIN_RPC_MAPPING[chainId];
  if (!config) {
    throw new Error(`No RPC URL configured for chain ID ${chainId}. Use setRpcUrl() to configure.`);
  }
  return config.rpcUrls[0];
}

export function getAllRpcUrls(chainId: number): string[] {
  const config = CHAIN_RPC_MAPPING[chainId];
  if (!config) return [];
  return config.rpcUrls;
}

const customRpcUrls = new Map<number, string>();

export function setRpcUrl(chainId: number, rpcUrl: string): void {
  if (!CHAIN_RPC_MAPPING[chainId]) {
    CHAIN_RPC_MAPPING[chainId] = {
      name: `Custom Chain ${chainId}`,
      rpcUrls: [rpcUrl],
      isTestnet: false,
    };
  } else {
    CHAIN_RPC_MAPPING[chainId].rpcUrls.unshift(rpcUrl);
  }
  customRpcUrls.set(chainId, rpcUrl);
}
