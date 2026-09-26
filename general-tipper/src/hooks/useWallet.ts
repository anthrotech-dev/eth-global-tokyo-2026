import { useCallback, useEffect, useState } from 'react'
import { getAddress, type Address } from 'viem'
import { chain } from '../lib/chain.ts'
import { errorMessage } from '../lib/errors.ts'
import { ensureChain, getWalletClient, hasProvider } from '../lib/clients.ts'

export type WalletState = {
  hasProvider: boolean
  account?: Address
  chainId?: number
  onTargetChain: boolean
  connecting: boolean
  error?: string
  connect: () => Promise<void>
  switchToTarget: () => Promise<void>
}


export function useWallet(): WalletState {
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()
  const provider = hasProvider()

  useEffect(() => {
    if (!provider) return
    const eth = window.ethereum!

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[]
      setAccount(list.length ? getAddress(list[0]) : undefined)
    }
    const onChain = (id: unknown) => setChainId(Number(id))

    eth.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => {})
    eth.request({ method: 'eth_chainId' }).then(onChain).catch(() => {})
    eth.on('accountsChanged', onAccounts)
    eth.on('chainChanged', onChain)
    return () => {
      eth.removeListener('accountsChanged', onAccounts)
      eth.removeListener('chainChanged', onChain)
    }
  }, [provider])

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
    connecting,
    error,
    connect,
    switchToTarget,
  }
}
