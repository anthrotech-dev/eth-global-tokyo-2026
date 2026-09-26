import { BaseError, ContractFunctionRevertedError } from 'viem'

/** Human-readable message for wallet/contract/network errors, surfacing decoded custom errors. */
export function errorMessage(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason ?? 'unknown error'
      const args = reverted.data?.args?.length ? `(${reverted.data.args.map(String).join(', ')})` : ''
      return `Contract reverted with ${name}${args}`
    }
    return e.shortMessage
  }
  if (e instanceof Error) return e.message
  return String(e)
}
