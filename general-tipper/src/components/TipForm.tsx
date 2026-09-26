import { useState, type FormEvent } from 'react'
import { formatEther, parseEther } from 'viem'
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
  let amountWei: bigint | undefined
  try {
    amountWei = parseEther(amount)
  } catch {
    amountWei = undefined
  }
  const insufficient = wallet.balance !== undefined && amountWei !== undefined && wallet.balance < amountWei
  const canSend = !!wallet.account && wallet.onTargetChain && !sending && amountWei !== undefined && !insufficient

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
      {!wallet.hasProvider && <ErrorBox message="No injected wallet detected. Install MetaMask and reload." />}
      {wallet.error && <ErrorBox message={wallet.error} />}
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
