import { formatEther } from 'viem'
import { explorerTxUrl } from '../lib/chain.ts'
import type { PaymentResult } from '../hooks/useTipFlow.ts'
import type { TippedEvent } from '../lib/tip.ts'
import { AddressLink } from './AddressLink.tsx'

type Props = { result: PaymentResult; tipped?: TippedEvent }

export function TxCard({ result, tipped }: Props) {
  const explorer = (result.chain === 'ethereum'
    ? explorerTxUrl(result.txId as `0x${string}`)
    : `https://suiscan.xyz/testnet/tx/${result.txId}`) ?? '#'
  const receiverPct = tipped ? Number((tipped.receiverAmount * 10_000n) / tipped.amount) / 100 : 0
  return <section className="card">
    <h2>4. Transaction ({result.chain === 'ethereum' ? 'Ethereum' : 'Sui'})</h2>
    <dl className="kv"><dt>{result.chain === 'ethereum' ? 'tx hash' : 'transaction digest'}</dt><dd><a href={explorer} target="_blank" rel="noreferrer"><code className="addr">{result.txId}</code></a></dd></dl>
    {!tipped && result.chain === 'ethereum' && <p className="hint">Waiting for the transaction to be mined…</p>}
    {!tipped && result.chain === 'sui' && <p className="hint">Sui PTB executed successfully. Open the digest to inspect the on-chain Tipped event.</p>}
    {tipped && <><h3>Tipped event</h3><div className="split" aria-label="split bar"><div className="split-receiver" style={{ width: `${receiverPct}%` }}>receiver {formatEther(tipped.receiverAmount)}</div><div className="split-host" style={{ width: `${100 - receiverPct}%` }}>{tipped.hostAmount > 0n ? `host ${formatEther(tipped.hostAmount)}` : ''}</div></div><dl className="kv"><dt>targetURI</dt><dd><code>{tipped.targetURI}</code></dd><dt>tipper</dt><dd><AddressLink address={tipped.tipper} /></dd><dt>receiver</dt><dd><AddressLink address={tipped.receiver} /> · {formatEther(tipped.receiverAmount)} ETH</dd><dt>host</dt><dd><AddressLink address={tipped.host} /> · {formatEther(tipped.hostAmount)} ETH</dd></dl></>}
  </section>
}
