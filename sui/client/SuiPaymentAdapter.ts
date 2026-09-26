import { Transaction } from '@mysten/sui/transactions';

const BPS_DENOMINATOR = 10_000;
const MAX_U64 = (1n << 64n) - 1n;

export type SuiTipRequest = {
  /** Total tip amount in MIST, excluding the Sui network fee. */
  amountMist: bigint;
  /** Same off-chain action identifier passed to Ethereum's tip(). */
  targetURI: string;
  receiver: string;
  /** Required unless ratioBps is 10,000. */
  host?: string;
  /** Receiver's share: 0..10,000 basis points. */
  ratioBps: number;
};

export type SuiPaymentAdapterConfig = {
  /** Published Sui package ID, configured after testnet deployment. */
  packageId: string;
};

function isZeroAddress(address: string): boolean {
  return /^0x0*$/i.test(address);
}

function validateRequest(request: SuiTipRequest): void {
  if (request.amountMist <= 0n || request.amountMist > MAX_U64) {
    throw new Error('amountMist must be a positive u64 MIST value.');
  }
  if (!Number.isInteger(request.ratioBps) || request.ratioBps < 0 || request.ratioBps > BPS_DENOMINATOR) {
    throw new Error('ratioBps must be an integer from 0 through 10,000.');
  }
  if (isZeroAddress(request.receiver)) {
    throw new Error('receiver must not be the zero address.');
  }
  if (request.ratioBps < BPS_DENOMINATOR && (!request.host || isZeroAddress(request.host))) {
    throw new Error('a non-zero host address is required when host receives a share.');
  }
}

/**
 * Creates the PTB only. The connected-wallet layer must sign and execute it.
 * The PTB splits a payment coin from the sender's gas coin, then calls the
 * stateless Move package to distribute it and emit the Tipped event atomically.
 */
export class SuiPaymentAdapter {
  constructor(private readonly config: SuiPaymentAdapterConfig) {}

  buildTip(request: SuiTipRequest): Transaction {
    validateRequest(request);

    const tx = new Transaction();
    const [paymentCoin] = tx.splitCoins(tx.gas, [request.amountMist]);
    tx.moveCall({
      target: `${this.config.packageId}::tip_splitter::tip`,
      typeArguments: ['0x2::sui::SUI'],
      arguments: [
        paymentCoin,
        tx.pure.string(request.targetURI),
        tx.pure.address(request.receiver),
        tx.pure.address(request.host ?? '0x0'),
        tx.pure.u16(request.ratioBps),
      ],
    });
    return tx;
  }
}
