import { Transaction } from '@mysten/sui/transactions'
import { SUI_TESTNET_CHAIN, signAndExecuteTransaction, type Wallet } from '@mysten/wallet-standard'
import type { WalletAccount } from '@wallet-standard/core'

const BPS_DENOMINATOR = 10_000

export const SUI_NETWORK = SUI_TESTNET_CHAIN

function zeroAddress(address: string): boolean {
  return /^0x0*$/i.test(address)
}

export function parseSui(amount: string): bigint {
  if (!/^\d+(\.\d{0,9})?$/.test(amount)) throw new Error(`Invalid SUI amount: ${amount}`)
  const [whole, decimal = ''] = amount.split('.')
  const mist = BigInt(whole) * 1_000_000_000n + BigInt((decimal + '000000000').slice(0, 9))
  if (mist <= 0n) throw new Error('Tip amount must be greater than zero.')
  return mist
}

export function formatSui(mist: bigint): string {
  const whole = mist / 1_000_000_000n
  const fraction = (mist % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export async function sendSuiTip(params: {
  wallet: Wallet
  account: WalletAccount
  packageId: string
  amountMist: bigint
  targetURI: string
  receiver: string
  host?: string
  ratioBps: number
}): Promise<string> {
  if (!params.packageId) throw new Error('VITE_SUI_PACKAGE_ID is not configured.')
  if (zeroAddress(params.receiver)) throw new Error('Sui receiver must not be the zero address.')
  if (!Number.isInteger(params.ratioBps) || params.ratioBps < 0 || params.ratioBps > BPS_DENOMINATOR) {
    throw new Error('Split ratio must be between 0 and 10,000 bps.')
  }
  if (params.ratioBps < BPS_DENOMINATOR && (!params.host || zeroAddress(params.host))) {
    throw new Error('A Sui host address is required when the host receives a share.')
  }

  const tx = new Transaction()
  tx.setSender(params.account.address)
  const [payment] = tx.splitCoins(tx.gas, [params.amountMist])
  tx.moveCall({
    target: `${params.packageId}::tip_splitter::tip`,
    typeArguments: ['0x2::sui::SUI'],
    arguments: [
      payment,
      tx.pure.string(params.targetURI),
      tx.pure.address(params.receiver),
      tx.pure.address(params.host ?? '0x0'),
      tx.pure.u16(params.ratioBps),
    ],
  })

  const result = await signAndExecuteTransaction(params.wallet, {
    transaction: tx,
    account: params.account,
    chain: SUI_NETWORK,
  })
  return result.digest
}
