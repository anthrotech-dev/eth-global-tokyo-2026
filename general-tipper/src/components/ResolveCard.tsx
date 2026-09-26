import { BPS_DENOMINATOR, NETWORKS, type Network, type ResolveResult, type Tipjars } from '../../shared/tipRouter.ts'
import { AddressLink } from './AddressLink.tsx'

function hostNote(r: ResolveResult): string {
  switch (r.host.status) {
    case 'ok':
      return `The host advertises a ${r.host.feeBps / 100}% fee at ${r.host.url}.`
    case 'missing':
      return `${r.host.url} was not found. The host has not adopted TipRouter, so 100% goes to the receiver.`
    case 'invalid':
      return `${r.host.url} exists but is not usable (${r.host.reason}). Falling back to 100% for the receiver.`
  }
}

/** Tipjars on networks other than the one we pay on. */
function OtherTipjars({ tipjars, except }: { tipjars: Tipjars; except: Network }) {
  const others = (Object.keys(tipjars) as Network[]).filter((n) => n !== except)
  if (!others.length) return null
  return (
    <div className="hint">
      Also accepts:{' '}
      {others.map((n) => (
        <span key={n}>
          {NETWORKS[n].label} <code className="addr">{tipjars[n]}</code>{' '}
        </span>
      ))}
      <span>(not payable from this client yet)</span>
    </div>
  )
}

export function ResolveCard({ resolved }: { resolved: ResolveResult }) {
  const receiverPct = resolved.ratioBps / 100
  const hostPct = (BPS_DENOMINATOR - resolved.ratioBps) / 100
  return (
    <section className="card">
      <h2>2. Resolved</h2>
      <dl className="kv">
        <dt>targetURI</dt>
        <dd>
          <code>{resolved.targetURI}</code>
        </dd>
        <dt>Network</dt>
        <dd>{NETWORKS[resolved.network].label}</dd>
        <dt>Receiver</dt>
        <dd>
          <AddressLink address={resolved.receiver as `0x${string}`} />
          {resolved.receiverSource.candidates > 1 && (
            <span className="warn">
              {' '}
              ({resolved.receiverSource.candidates} distinct {resolved.network}: addresses found; using the first)
            </span>
          )}
          <OtherTipjars tipjars={resolved.receiverTipjars} except={resolved.network} />
        </dd>
        <dt>Host</dt>
        <dd>
          {resolved.host.tipjar ? <AddressLink address={resolved.host.tipjar as `0x${string}`} /> : <em>none (zero address)</em>}
          <div className="hint">{hostNote(resolved)}</div>
          <OtherTipjars tipjars={resolved.host.tipjars} except={resolved.network} />
        </dd>
        <dt>Split</dt>
        <dd>
          receiver {receiverPct}% / host {hostPct}% <span className="hint">(ratioBps = {resolved.ratioBps})</span>
        </dd>
      </dl>
    </section>
  )
}
