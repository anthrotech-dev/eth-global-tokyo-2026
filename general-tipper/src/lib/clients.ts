import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { chain, rpcUrl } from './chain.ts'

export class NoWalletError extends Error {
  constructor() {
    super('No injected wallet found. Install MetaMask (or another EIP-1193 wallet) and reload.')
    this.name = 'NoWalletError'
  }
}

export function hasProvider(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

export function getProvider(): EIP1193Provider {
  if (!window.ethereum) throw new NoWalletError()
  return window.ethereum
}

export function getWalletClient(account?: Address): WalletClient {
  return createWalletClient({ chain, account, transport: custom(getProvider()) })
}

let publicClient: PublicClient | undefined
export function getPublicClient(): PublicClient {
  if (publicClient) return publicClient
  publicClient = createPublicClient({
    chain,
    transport: hasProvider() ? custom(getProvider()) : http(rpcUrl),
  })
  return publicClient
}

function errorCode(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const any = e as { code?: unknown; cause?: unknown; data?: { originalError?: { code?: unknown } } }
  if (typeof any.code === 'number') return any.code
  const orig = any.data?.originalError?.code
  if (typeof orig === 'number') return orig
  if (any.cause) return errorCode(any.cause)
  return undefined
}

/** Switch the wallet to the configured chain, adding it first if the wallet does not know it (4902). */
export async function ensureChain(wc: WalletClient): Promise<void> {
  try {
    await wc.switchChain({ id: chain.id })
  } catch (e) {
    if (errorCode(e) !== 4902) throw e
    await wc.addChain({ chain })
    await wc.switchChain({ id: chain.id })
  }
}
