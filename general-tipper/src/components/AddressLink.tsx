import type { Address } from 'viem'
import { explorerAddressUrl } from '../lib/chain.ts'

export function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address)
  const text = <code className="addr">{address}</code>
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    text
  )
}
