import { useState, type FormEvent } from 'react'
import { formatEther, parseEther } from 'viem'
import type { ResolveResult } from '../../shared/tipRouter.ts'
import { chain } from '../lib/chain.ts'
import { parseSui } from '../lib/sui.ts'
import type { SuiWalletState } from '../hooks/useSuiWallet.ts'
import type { WalletState } from '../hooks/useWallet.ts'
import { ErrorBox } from './ErrorBox.tsx'

export type PaymentChain = 'ethereum' | 'sui'

type Props = {
  resolved: ResolveResult
  ethereum: WalletState
  sui: SuiWalletState
  sending: boolean
  onSendEthereum: (amountEth: string) => void
  onSendSui: (amountSui: string) => void
}

export function TipForm({ resolved, ethereum, sui, sending, onSendEthereum, onSendSui }: Props) {
  const [network, setNetwork] = useState<PaymentChain>('ethereum')
  const [amount, setAmount] = useState('0.01')
  const recipient = resolved.receiverTipjars[network]
  const host = resolved.host.tipjars[network]
  const ratioBps = host ? resolved.ratioBps : 10_000
  let amountBase: bigint | undefined
  try { amountBase = network === 'ethereum' ? parseEther(amount) : parseSui(amount) } catch { amountBase = undefined }
  const insufficient = network === 'ethereum' && ethereum.balance !== undefined && amountBase !== undefined && ethereum.balance < amountBase
  const canSend = network === 'ethereum'
    ? !!recipient && !!ethereum.account && ethereum.onTargetChain && !sending && amountBase !== undefined && !insufficient
    : !!recipient && !!sui.account && !!sui.wallet && !sending && amountBase !== undefined
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    if (network === 'ethereum') onSendEthereum(amount)
    else onSendSui(amount)
  }

  return <section className="card">
    <h2>3. Send a tip</h2>
    <div className="network-picker" aria-label="Payment network">
      <button type="button" className={network === 'ethereum' ? 'selected' : ''} onClick={() => setNetwork('ethereum')} disabled={sending}>Ethereum</button>
      <button type="button" className={network === 'sui' ? 'selected' : ''} onClick={() => setNetwork('sui')} disabled={sending}>Sui testnet</button>
    </div>
    {!recipient && <ErrorBox message={`This user does not accept tips on ${network === 'ethereum' ? 'Ethereum' : 'Sui'}.`} />}
    {recipient && <p className="hint">recipient <code className="addr">{recipient}</code>{host ? ` · host split ${ratioBps / 100}% / ${(10_000 - ratioBps) / 100}%` : ' · no host tipjar on this network; receiver gets 100%'}</p>}
    {network === 'ethereum' ? <div className="row wallet">
      <span className={`badge ${ethereum.onTargetChain ? 'ok' : ''}`}>{chain.name}</span>
      {ethereum.account ? <><code className="addr">{ethereum.account}</code>{ethereum.balance !== undefined && <span className="hint">balance {Number(formatEther(ethereum.balance)).toLocaleString()} ETH</span>}<button type="button" className="link" onClick={() => ethereum.chooseAccount()}>Switch account</button></> : <button type="button" onClick={ethereum.connect} disabled={!ethereum.hasProvider || ethereum.connecting}>{ethereum.connecting ? 'Connecting…' : 'Connect wallet'}</button>}
      {ethereum.account && !ethereum.onTargetChain && <button type="button" onClick={() => ethereum.switchToTarget().catch(() => {})}>Switch to {chain.name}</button>}
    </div> : <div className="row wallet"><span className={`badge ${sui.account ? 'ok' : ''}`}>Sui testnet</span>{sui.account ? <code className="addr">{sui.account.address}</code> : <button type="button" onClick={sui.connect} disabled={!sui.hasWallet || sui.connecting}>{sui.connecting ? 'Connecting…' : 'Connect Sui wallet'}</button>}</div>}
    {network === 'ethereum' && !ethereum.hasProvider && <ErrorBox message="No injected Ethereum wallet detected. Install MetaMask and reload." />}
    {network === 'sui' && !sui.hasWallet && <ErrorBox message="No Sui Wallet Standard wallet detected. Install Sui Wallet and reload." />}
    {ethereum.error && network === 'ethereum' && <ErrorBox message={ethereum.error} />}
    {sui.error && network === 'sui' && <ErrorBox message={sui.error} />}
    {insufficient && <ErrorBox message={`This account has ${formatEther(ethereum.balance!)} ETH on ${chain.name}, less than the tip.`} />}
    <form onSubmit={submit} className="row"><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={sending} aria-label={`amount in ${network === 'ethereum' ? 'ETH' : 'SUI'}`} /><span>{network === 'ethereum' ? 'ETH' : 'SUI'}</span><button type="submit" disabled={!canSend}>{sending ? 'Sending…' : 'Send tip'}</button></form>
  </section>
}
