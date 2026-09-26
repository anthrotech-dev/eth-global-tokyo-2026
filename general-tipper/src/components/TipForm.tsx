import { useState, type FormEvent } from 'react'
import { chain } from '../lib/chain.ts'
import type { WalletState } from '../hooks/useWallet.ts'
import { ErrorBox } from './ErrorBox.tsx'

type Props = {
  wallet: WalletState
  sending: boolean
  onSend: (amountEth: string) => void
}

export function TipForm({ wallet, sending, onSend }: Props) {
  const [amount, setAmount] = useState('0.01')
  const canSend = !!wallet.account && wallet.onTargetChain && !sending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSend) onSend(amount)
  }

  return (
    <section className="card">
      <h2>3. Send a tip</h2>
      <div className="row wallet">
        <span className={`badge ${wallet.onTargetChain ? 'ok' : ''}`}>{chain.name}</span>
        {wallet.account ? (
          <code className="addr">{wallet.account}</code>
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
      {!wallet.hasProvider && <ErrorBox message="No injected wallet detected. Install MetaMask and reload." />}
      {wallet.error && <ErrorBox message={wallet.error} />}
      <form onSubmit={submit} className="row">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={sending}
          aria-label="amount in ETH"
        />
        <span>ETH</span>
        <button type="submit" disabled={!canSend}>
          {sending ? 'Sending…' : 'Send tip'}
        </button>
      </form>
    </section>
  )
}
