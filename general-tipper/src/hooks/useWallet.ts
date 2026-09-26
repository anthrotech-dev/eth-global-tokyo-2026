import { useCallback, useEffect, useState } from 'react'
import { getAddress, type Address } from 'viem'
import { chain } from '../lib/chain.ts'
import { errorMessage } from '../lib/errors.ts'
import { ensureChain, getPublicClient, getWalletClient, hasProvider } from '../lib/clients.ts'

export type WalletState = {
  hasProvider: boolean
  account?: Address
  chainId?: number
  onTargetChain: boolean
  /** Native balance of `account` on the target chain (undefined while loading / off-chain). */
  balance?: bigint
  connecting: boolean
  error?: string
  connect: () => Promise<void>
  /** Re-open the wallet's account picker so the user can connect/select a different account. */
  chooseAccount: () => Promise<void>
  switchToTarget: () => Promise<void>
  refreshBalance: () => Promise<void>
}


export function useWallet(): WalletState {
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [balance, setBalance] = useState<bigint>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()
  const provider = hasProvider()

  useEffect(() => {
    if (!provider) return
    const eth = window.ethereum!

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[]
      setBalance(undefined)
      setAccount(list.length ? getAddress(list[0]) : undefined)
    }
    const onChain = (id: unknown) => {
      setBalance(undefined)
      setChainId(Number(id))
    }

    eth.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => {})
    eth.request({ method: 'eth_chainId' }).then(onChain).catch(() => {})
    eth.on('accountsChanged', onAccounts)
    eth.on('chainChanged', onChain)
    return () => {
      eth.removeListener('accountsChanged', onAccounts)
      eth.removeListener('chainChanged', onChain)
    }
  }, [provider])

  const refreshBalance = useCallback(async () => {
    if (!account || chainId !== chain.id) return
    try {
      const b = await getPublicClient().getBalance({ address: account })
      setBalance(b)
    } catch {
      // keep the previous value; the wallet will surface RPC problems on send
    }
  }, [account, chainId])

  useEffect(() => {
    let cancelled = false
    if (account && chainId === chain.id) {
      getPublicClient()
        .getBalance({ address: account })
        .then((b) => {
          if (!cancelled) setBalance(b)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [account, chainId])

  const chooseAccount = useCallback(async () => {
    setError(undefined)
    try {
      const eth = window.ethereum!
      // Forces MetaMask to show the account picker even when the site is already connected.
      await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
      const accounts = (await eth.request({ method: 'eth_accounts' })) as string[]
      setBalance(undefined)
      setAccount(accounts.length ? getAddress(accounts[0]) : undefined)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  const switchToTarget = useCallback(async () => {
    setError(undefined)
    try {
      await ensureChain(getWalletClient())
      setChainId(chain.id)
    } catch (e) {
      setError(errorMessage(e))
      throw e
    }
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(undefined)
    try {
      const wc = getWalletClient()
      const [first] = await wc.requestAddresses()
      setAccount(first)
      await ensureChain(wc)
      setChainId(chain.id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setConnecting(false)
    }
  }, [])

  return {
    hasProvider: provider,
    account,
    chainId,
    onTargetChain: chainId === chain.id,
    balance: chainId === chain.id ? balance : undefined,
    connecting,
    error,
    connect,
    chooseAccount,
    switchToTarget,
    refreshBalance,
  }
}
