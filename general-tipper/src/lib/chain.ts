import { getAddress, type Address, type Chain, type Hash } from 'viem'
import { anvil, sepolia } from 'viem/chains'

export const chainKey: 'sepolia' | 'anvil' = import.meta.env.VITE_CHAIN === 'anvil' ? 'anvil' : 'sepolia'

export const chain: Chain = chainKey === 'anvil' ? anvil : sepolia

const rawAddress = import.meta.env.VITE_TIPSPLITTER_ADDRESS
if (!rawAddress) {
  throw new Error('VITE_TIPSPLITTER_ADDRESS is not set. Copy .env.example to .env.local and fill it in.')
}
export const TIP_SPLITTER_ADDRESS: Address = getAddress(rawAddress)

export const rpcUrl: string | undefined = import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0]

function explorerBase(): string | null {
  return chain.blockExplorers?.default.url ?? null
}

export function explorerTxUrl(hash: Hash): string | null {
  const base = explorerBase()
  return base ? `${base}/tx/${hash}#eventlog` : null
}

export function explorerAddressUrl(address: Address): string | null {
  const base = explorerBase()
  return base ? `${base}/address/${address}` : null
}
