import { useState, type FormEvent } from 'react'
import { formatEther, parseEther } from 'viem'
import { NETWORKS, type Network, type ResolveResult } from '../../shared/tipRouter.ts'
import { chain } from '../lib/chain.ts'
import { parseSui } from '../lib/sui.ts'
import type { SuiWalletState } from '../hooks/useSuiWallet.ts'
import type { WalletState } from '../hooks/useWallet.ts'
import { ErrorBox } from './ErrorBox.tsx'

type Props = {
  resolved: ResolveResult
  wallet: WalletState
  sui: SuiWalletState
  sending: boolean
  onSend: (amountEth: string) => void
  onSendSui: (amountSui: string) => void
}

const UNIT: Record<Network, string> = { ethereum: 'ETH', sui: 'SUI' }

function EthereumWallet({ wallet }: { wallet: WalletState }) {
  return (
    <div className="row wallet">
      <span className={`badge ${wallet.onTargetChain ? 'ok' : ''}`}>{chain.name}</span>
      {wallet.account ? (
        <>
          <code className="addr">{wallet.account}</code>
          {wallet.balance !== undefined && (
            <span className="hint">balance {Number(formatEther(wallet.balance)).toLocaleString()} ETH</span>
          )}
          <button type="button" className="link" onClick={() => wallet.chooseAccount()}>
            Switch account
          </button>
        </>
      ) : (
        <button type="button" onClick={wallet.connect} disabled={!wallet.hasProvider || wallet.connecting}>
          {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
      {wallet.account && !wallet.onTargetChain && (
        <button type="button" onClick={() => wallet.switchToTarget().catch(() => {})}>
          Switch to {chain.name}
        </button>
      )}
    </div>
  )
}

function SuiWallet({ wallet }: { wallet: SuiWalletState }) {
  return (
    <div className="row wallet">
      <span className={`badge ${wallet.account ? 'ok' : ''}`}>Sui testnet</span>
      {wallet.account ? (
        <code className="addr">{wallet.account.address}</code>
      ) : (
        <button type="button" onClick={wallet.connect} disabled={!wallet.hasWallet || wallet.connecting}>
          {wallet.connecting ? 'Connecting…' : 'Connect Sui wallet'}
        </button>
      )}
    </div>
  )
}

export function TipForm({ resolved, wallet, sui, sending, onSend, onSendSui }: Props) {
  const [network, setNetwork] = useState<Network>(resolved.network)
  const [amount, setAmount] = useState('0.01')
  const recipient = resolved.receiverTipjars[network]
  const host = resolved.host.tipjars[network]
  const ratioBps = host ? resolved.ratioBps : 10_000

  let amountBase: bigint | undefined
  try {
    amountBase = network === 'ethereum' ? parseEther(amount) : parseSui(amount)
  } catch {
    amountBase = undefined
  }
  const insufficient =
    network === 'ethereum' && wallet.balance !== undefined && amountBase !== undefined && wallet.balance < amountBase
  const connected = network === 'ethereum' ? !!wallet.account && wallet.onTargetChain : !!sui.account
  const canSend = !!recipient && connected && !sending && amountBase !== undefined && !insufficient

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    if (network === 'ethereum') onSend(amount)
    else onSendSui(amount)
  }

  return (
    <section className="card">
      <h2>3. Send a tip</h2>
      <div className="network-picker" aria-label="Payment network">
        {(Object.keys(NETWORKS) as Network[]).map((n) => (
          <button
            key={n}
            type="button"
            className={network === n ? 'selected' : ''}
            onClick={() => setNetwork(n)}
            disabled={sending}
          >
            {NETWORKS[n].label}
          </button>
        ))}
      </div>
      {!recipient && <ErrorBox message={`This profile does not advertise a ${NETWORKS[network].label} tipjar.`} />}
      {recipient && (
        <p className="hint">
          recipient <code className="addr">{recipient}</code>
          {host
            ? ` · split receiver ${ratioBps / 100}% / host ${(10_000 - ratioBps) / 100}%`
            : ' · no host tipjar on this network, receiver gets 100%'}
        </p>
      )}
      {network === 'ethereum' ? <EthereumWallet wallet={wallet} /> : <SuiWallet wallet={sui} />}
      {network === 'ethereum' && !wallet.hasProvider && (
        <ErrorBox message="No injected wallet detected. Install MetaMask and reload." />
      )}
      {network === 'sui' && !sui.hasWallet && (
        <ErrorBox message="No Sui Wallet Standard wallet detected. Install Sui Wallet and reload." />
      )}
      {network === 'ethereum' && wallet.error && <ErrorBox message={wallet.error} />}
      {network === 'sui' && sui.error && <ErrorBox message={sui.error} />}
      {insufficient && (
        <ErrorBox
          message={`This account has ${formatEther(wallet.balance!)} ETH on ${chain.name}, less than the tip. Pick a funded account with "Switch account" (on Anvil, import account 0).`}
        />
      )}
      <form onSubmit={submit} className="row">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={sending}
          aria-label={`amount in ${UNIT[network]}`}
        />
        <span>{UNIT[network]}</span>
        <button type="submit" disabled={!canSend}>
          {sending ? 'Sending…' : 'Send tip'}
        </button>
      </form>
    </section>
  )
}
