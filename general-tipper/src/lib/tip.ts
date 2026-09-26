import {
  isAddressEqual,
  parseEventLogs,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { ZERO_ADDRESS, type ResolveResult } from '../../shared/tipRouter.ts'
import { tipSplitterAbi } from './abi.ts'
import { TIP_SPLITTER_ADDRESS, chain } from './chain.ts'
import { ensureChain, getPublicClient, getWalletClient } from './clients.ts'

export type TippedEvent = {
  targetURIHash: Hex
  receiver: Address
  host: Address
  tipper: Address
  targetURI: string
  amount: bigint
  receiverAmount: bigint
  hostAmount: bigint
}

export function tipArgs(resolved: ResolveResult): readonly [string, Address, Address, number] {
  const receiver = resolved.receiverTipjars.ethereum
  if (!receiver) throw new Error('This profile does not accept tips on Ethereum.')
  const host = resolved.host.tipjars.ethereum ?? ZERO_ADDRESS
  const ratioBps = resolved.host.tipjars.ethereum ? resolved.ratioBps : 10_000
  return [resolved.targetURI, receiver as Address, host as Address, ratioBps]
}

/** Simulate first so custom errors are decoded by viem, then ask the wallet to sign. */
export async function sendTip(p: { account: Address; resolved: ResolveResult; amountWei: bigint }): Promise<Hash> {
  const walletClient = getWalletClient(p.account)
  await ensureChain(walletClient)

  const { request } = await getPublicClient().simulateContract({
    address: TIP_SPLITTER_ADDRESS,
    abi: tipSplitterAbi,
    functionName: 'tip',
    args: tipArgs(p.resolved),
    value: p.amountWei,
    account: p.account,
  })
  return walletClient.writeContract({ ...request, chain })
}

export async function waitForTipped(hash: Hash): Promise<{ receipt: TransactionReceipt; tipped: TippedEvent }> {
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`)

  const logs = parseEventLogs({ abi: tipSplitterAbi, eventName: 'Tipped', logs: receipt.logs })
  const log = logs.find((l) => isAddressEqual(l.address, TIP_SPLITTER_ADDRESS))
  if (!log) throw new Error(`No Tipped event from ${TIP_SPLITTER_ADDRESS} in receipt ${hash}`)

  const a = log.args
  return {
    receipt,
    tipped: {
      targetURIHash: a.targetURIHash,
      receiver: a.receiver,
      host: a.host,
      tipper: a.tipper,
      targetURI: a.targetURI,
      amount: a.amount,
      receiverAmount: a.receiverAmount,
      hostAmount: a.hostAmount,
    },
  }
}

export async function readBalance(account: Address): Promise<bigint> {
  return getPublicClient().readContract({
    address: TIP_SPLITTER_ADDRESS,
    abi: tipSplitterAbi,
    functionName: 'balances',
    args: [account],
  })
}
