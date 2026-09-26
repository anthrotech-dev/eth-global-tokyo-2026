import { useCallback, useReducer } from 'react'
import { parseEther, type Address, type TransactionReceipt } from 'viem'
import type { Wallet } from '@mysten/wallet-standard'
import type { WalletAccount } from '@wallet-standard/core'
import type { ResolveResult } from '../../shared/tipRouter.ts'
import type { PaymentChain } from '../components/TipForm.tsx'
import { errorMessage } from '../lib/errors.ts'
import { resolveTarget } from '../lib/resolver.ts'
import { parseSui, sendSuiTip } from '../lib/sui.ts'
import { sendTip, waitForTipped, type TippedEvent } from '../lib/tip.ts'
import { verifyTip, type VerificationReport } from '../lib/verifier.ts'

export type Step = 'idle' | 'resolving' | 'resolved' | 'sending' | 'mined' | 'verifying' | 'verified'
export type PaymentResult = { chain: PaymentChain; txId: string }
export type FlowState = { step: Step; inputUrl?: string; resolved?: ResolveResult; result?: PaymentResult; receipt?: TransactionReceipt; tipped?: TippedEvent; report?: VerificationReport; error?: { at: Step; message: string } }
type Action =
  | { type: 'RESOLVE_START'; inputUrl: string } | { type: 'RESOLVE_OK'; resolved: ResolveResult }
  | { type: 'SEND_START' } | { type: 'SEND_SUBMITTED'; result: PaymentResult } | { type: 'ETH_MINED'; receipt: TransactionReceipt; tipped: TippedEvent } | { type: 'SUI_MINED' }
  | { type: 'VERIFY_START' } | { type: 'VERIFY_OK'; report: VerificationReport } | { type: 'FAIL'; at: Step; message: string; fallback: Step } | { type: 'RESET' }
const initial: FlowState = { step: 'idle' }
function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case 'RESOLVE_START': return { step: 'resolving', inputUrl: action.inputUrl }
    case 'RESOLVE_OK': return { step: 'resolved', inputUrl: state.inputUrl, resolved: action.resolved }
    case 'SEND_START': return { ...state, step: 'sending', result: undefined, receipt: undefined, tipped: undefined, report: undefined, error: undefined }
    case 'SEND_SUBMITTED': return { ...state, step: 'sending', result: action.result }
    case 'ETH_MINED': return { ...state, step: 'mined', receipt: action.receipt, tipped: action.tipped, error: undefined }
    case 'SUI_MINED': return { ...state, step: 'mined', error: undefined }
    case 'VERIFY_START': return { ...state, step: 'verifying', error: undefined }
    case 'VERIFY_OK': return { ...state, step: 'verified', report: action.report }
    case 'FAIL': return { ...state, step: action.fallback, error: { at: action.at, message: action.message } }
    case 'RESET': return initial
  }
}

export function useTipFlow() {
  const [state, dispatch] = useReducer(reducer, initial)
  const resolve = useCallback(async (inputUrl: string) => {
    dispatch({ type: 'RESOLVE_START', inputUrl })
    try { dispatch({ type: 'RESOLVE_OK', resolved: await resolveTarget(inputUrl) }) }
    catch (error) { dispatch({ type: 'FAIL', at: 'resolving', message: errorMessage(error), fallback: 'idle' }) }
  }, [])
  const verifyEvent = useCallback(async (tipped: TippedEvent, inputUrl?: string) => {
    dispatch({ type: 'VERIFY_START' })
    try { dispatch({ type: 'VERIFY_OK', report: verifyTip(tipped, await resolveTarget(tipped.targetURI), inputUrl) }) }
    catch (error) { dispatch({ type: 'FAIL', at: 'verifying', message: errorMessage(error), fallback: 'mined' }) }
  }, [])
  const sendEthereum = useCallback(async (account: Address, amountEth: string) => {
    if (!state.resolved) return
    dispatch({ type: 'SEND_START' })
    try {
      const hash = await sendTip({ account, resolved: state.resolved, amountWei: parseEther(amountEth) })
      dispatch({ type: 'SEND_SUBMITTED', result: { chain: 'ethereum', txId: hash } })
      const { receipt, tipped } = await waitForTipped(hash)
      dispatch({ type: 'ETH_MINED', receipt, tipped })
      await verifyEvent(tipped, state.inputUrl)
    } catch (error) { dispatch({ type: 'FAIL', at: 'sending', message: errorMessage(error), fallback: 'resolved' }) }
  }, [state.resolved, state.inputUrl, verifyEvent])
  const sendSui = useCallback(async (wallet: Wallet, account: WalletAccount, amountSui: string) => {
    if (!state.resolved) return
    const receiver = state.resolved.receiverTipjars.sui
    if (!receiver) return
    dispatch({ type: 'SEND_START' })
    try {
      const host = state.resolved.host.tipjars.sui
      const digest = await sendSuiTip({ wallet, account, packageId: import.meta.env.VITE_SUI_PACKAGE_ID ?? '', amountMist: parseSui(amountSui), targetURI: state.resolved.targetURI, receiver, host, ratioBps: host ? state.resolved.ratioBps : 10_000 })
      dispatch({ type: 'SEND_SUBMITTED', result: { chain: 'sui', txId: digest } })
      dispatch({ type: 'SUI_MINED' })
    } catch (error) { dispatch({ type: 'FAIL', at: 'sending', message: errorMessage(error), fallback: 'resolved' }) }
  }, [state.resolved])
  const verify = useCallback(async () => { if (state.tipped) await verifyEvent(state.tipped, state.inputUrl) }, [state.tipped, state.inputUrl, verifyEvent])
  return { state, resolve, sendEthereum, sendSui, verify, reset: useCallback(() => dispatch({ type: 'RESET' }), []) }
}
