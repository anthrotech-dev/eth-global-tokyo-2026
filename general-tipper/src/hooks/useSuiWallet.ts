import { useCallback, useState } from 'react'
import { getWallets } from '@wallet-standard/app'
import { SUI_TESTNET_CHAIN, isWalletWithRequiredFeatureSet, type Wallet } from '@mysten/wallet-standard'
import type { WalletAccount } from '@wallet-standard/core'
import { errorMessage } from '../lib/errors.ts'

export type SuiWalletState = {
  wallet?: Wallet
  account?: WalletAccount
  connecting: boolean
  error?: string
  hasWallet: boolean
  connect: () => Promise<void>
}

export function useSuiWallet(): SuiWalletState {
  const [wallet, setWallet] = useState<Wallet>()
  const [account, setAccount] = useState<WalletAccount>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()
  const wallets = getWallets().get().filter((candidate) =>
    candidate.chains.includes(SUI_TESTNET_CHAIN) && isWalletWithRequiredFeatureSet(candidate),
  )

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(undefined)
    try {
      const selected = getWallets().get().find((candidate) =>
        candidate.chains.includes(SUI_TESTNET_CHAIN) && isWalletWithRequiredFeatureSet(candidate),
      )
      if (!selected) throw new Error('No Sui Wallet Standard wallet for Sui testnet was detected.')
      const connection = selected.features['standard:connect'] as unknown as {
        connect: () => Promise<{ accounts: WalletAccount[] }>
      }
      const { accounts } = await connection.connect()
      const selectedAccount = accounts.find((candidate) => candidate.chains.includes(SUI_TESTNET_CHAIN))
      if (!selectedAccount) throw new Error('The connected Sui wallet has no account enabled for Sui testnet.')
      setWallet(selected)
      setAccount(selectedAccount)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setConnecting(false)
    }
  }, [])

  return { wallet, account, connecting, error, hasWallet: wallets.length > 0, connect }
}
