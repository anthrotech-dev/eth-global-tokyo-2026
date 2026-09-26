import { useCallback, useReducer } from 'react'
import { parseEther, type Address, type Hash, type TransactionReceipt } from 'viem'
import type { ResolveResult } from '../../shared/tipRouter.ts'
import { errorMessage } from '../lib/errors.ts'
import { resolveTarget } from '../lib/resolver.ts'
import { sendTip, waitForTipped, type TippedEvent } from '../lib/tip.ts'
import { verifyTip, type VerificationReport } from '../lib/verifier.ts'

export type Step = 'idle' | 'resolving' | 'resolved' | 'sending' | 'mined' | 'verifying' | 'verified'

export type FlowState = {
  step: Step
  inputUrl?: string
  resolved?: ResolveResult
  hash?: Hash
  receipt?: TransactionReceipt
  tipped?: TippedEvent
  report?: VerificationReport
  /** Error attached to the step it happened in; state keeps the last good data. */
  error?: { at: Step; message: string }
}

type Action =
  | { type: 'RESOLVE_START'; inputUrl: string }
  | { type: 'RESOLVE_OK'; resolved: ResolveResult }
  | { type: 'SEND_START' }
  | { type: 'SEND_SUBMITTED'; hash: Hash }
  | { type: 'MINED'; receipt: TransactionReceipt; tipped: TippedEvent }
  | { type: 'VERIFY_START' }
  | { type: 'VERIFY_OK'; report: VerificationReport }
  | { type: 'FAIL'; at: Step; message: string; fallback: Step }
  | { type: 'RESET' }

const initial: FlowState = { step: 'idle' }

function reducer(s: FlowState, a: Action): FlowState {
  switch (a.type) {
    case 'RESOLVE_START':
      return { step: 'resolving', inputUrl: a.inputUrl }
    case 'RESOLVE_OK':
      return { step: 'resolved', inputUrl: s.inputUrl, resolved: a.resolved }
    case 'SEND_START':
      return { ...s, step: 'sending', hash: undefined, receipt: undefined, tipped: undefined, report: undefined, error: undefined }
    case 'SEND_SUBMITTED':
      return { ...s, step: 'sending', hash: a.hash }
    case 'MINED':
      return { ...s, step: 'mined', receipt: a.receipt, tipped: a.tipped, error: undefined }
    case 'VERIFY_START':
      return { ...s, step: 'verifying', error: undefined }
    case 'VERIFY_OK':
      return { ...s, step: 'verified', report: a.report }
    case 'FAIL':
      return { ...s, step: a.fallback, error: { at: a.at, message: a.message } }
    case 'RESET':
      return initial
  }
}


export function useTipFlow() {
  const [state, dispatch] = useReducer(reducer, initial)

  const resolve = useCallback(async (inputUrl: string) => {
    dispatch({ type: 'RESOLVE_START', inputUrl })
    try {
      const resolved = await resolveTarget(inputUrl)
      dispatch({ type: 'RESOLVE_OK', resolved })
    } catch (e) {
      dispatch({ type: 'FAIL', at: 'resolving', message: errorMessage(e), fallback: 'idle' })
    }
  }, [])

  const verifyEvent = useCallback(async (tipped: TippedEvent, inputUrl?: string) => {
    dispatch({ type: 'VERIFY_START' })
    try {
      const fresh = await resolveTarget(tipped.targetURI)
      dispatch({ type: 'VERIFY_OK', report: verifyTip(tipped, fresh, inputUrl) })
    } catch (e) {
      dispatch({ type: 'FAIL', at: 'verifying', message: errorMessage(e), fallback: 'mined' })
    }
  }, [])

  const send = useCallback(
    async (account: Address, amountEth: string) => {
      if (!state.resolved) return
      dispatch({ type: 'SEND_START' })
      let amountWei: bigint
      try {
        amountWei = parseEther(amountEth)
      } catch {
        dispatch({ type: 'FAIL', at: 'sending', message: `Invalid amount: ${amountEth}`, fallback: 'resolved' })
        return
      }
      try {
        const hash = await sendTip({ account, resolved: state.resolved, amountWei })
        dispatch({ type: 'SEND_SUBMITTED', hash })
        const { receipt, tipped } = await waitForTipped(hash)
        dispatch({ type: 'MINED', receipt, tipped })
        await verifyEvent(tipped, state.inputUrl)
      } catch (e) {
        dispatch({ type: 'FAIL', at: 'sending', message: errorMessage(e), fallback: 'resolved' })
      }
    },
    [state.resolved, state.inputUrl, verifyEvent],
  )

  const verify = useCallback(async () => {
    if (!state.tipped) return
    await verifyEvent(state.tipped, state.inputUrl)
  }, [state.tipped, state.inputUrl, verifyEvent])

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return { state, resolve, send, verify, reset }
}
