import { formatEther, type Hash } from 'viem'
import { chainKey, explorerTxUrl } from '../lib/chain.ts'
import type { TippedEvent } from '../lib/tip.ts'
import { AddressLink } from './AddressLink.tsx'

type Props = {
  hash: Hash
  tipped?: TippedEvent
}

export function TxCard({ hash, tipped }: Props) {
  const explorer = explorerTxUrl(hash)
  const receiverPct = tipped ? Number((tipped.receiverAmount * 10_000n) / tipped.amount) / 100 : 0

  return (
    <section className="card">
      <h2>4. Transaction</h2>
      <dl className="kv">
        <dt>tx hash</dt>
        <dd>
          {explorer ? (
            <a href={explorer} target="_blank" rel="noreferrer">
              <code className="addr">{hash}</code>
            </a>
          ) : (
            <>
              <code className="addr">{hash}</code>
              <div className="hint">No block explorer for {chainKey}. Inspect the log with `cast receipt`.</div>
            </>
          )}
        </dd>
      </dl>
      {!tipped && <p className="hint">Waiting for the transaction to be mined…</p>}
      {tipped && (
        <>
          <h3>Tipped event</h3>
          <div className="split" aria-label="split bar">
            <div className="split-receiver" style={{ width: `${receiverPct}%` }}>
              receiver {formatEther(tipped.receiverAmount)}
            </div>
            <div className="split-host" style={{ width: `${100 - receiverPct}%` }}>
              {tipped.hostAmount > 0n ? `host ${formatEther(tipped.hostAmount)}` : ''}
            </div>
          </div>
          <dl className="kv">
            <dt>targetURI</dt>
            <dd>
              <code>{tipped.targetURI}</code>
            </dd>
            <dt>targetURIHash</dt>
            <dd>
              <code className="addr">{tipped.targetURIHash}</code>
            </dd>
            <dt>tipper</dt>
            <dd>
              <AddressLink address={tipped.tipper} />
            </dd>
            <dt>receiver</dt>
            <dd>
              <AddressLink address={tipped.receiver} /> — {formatEther(tipped.receiverAmount)} ETH
            </dd>
            <dt>host</dt>
            <dd>
              <AddressLink address={tipped.host} /> — {formatEther(tipped.hostAmount)} ETH
            </dd>
            <dt>amount</dt>
            <dd>{formatEther(tipped.amount)} ETH</dd>
          </dl>
        </>
      )}
    </section>
  )
}
