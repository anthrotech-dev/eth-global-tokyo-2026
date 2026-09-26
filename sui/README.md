# Sui TipSplitter

Sui implementation of the semantics in `contract/src/TipSplitter.sol`. The
existing EVM contract is unchanged.

## Design

The Move package is stateless: it owns no shared object, escrow balance,
treasury, or admin capability. A PTB splits a tip coin from the payer's SUI
gas coin, calls `tip_splitter::tip`, then the Move entrypoint transfers the
receiver and host shares immediately and emits `Tipped`.

This intentionally differs from EVM's pull-payment storage model. It preserves
the observable tip semantics while using Sui's owned Coin model instead of
recreating an EVM `mapping(address => uint256)` as a shared object.

The allocation and validation rules match EVM:

- `amount > 0`
- `ratioBps` is 0 through 10,000
- receiver cannot be the zero address
- host may be zero only when its share is zero
- `ratioBps: 8000` means receiver 80% / host 20%
- integer rounding dust goes to receiver

## Frontend integration

After publishing, configure the resulting package ID in the frontend and pass
the returned transaction to the connected Sui wallet for signing.

```ts
import { SuiPaymentAdapter } from './client/SuiPaymentAdapter.js';

const sui = new SuiPaymentAdapter({ packageId: SUI_TIP_SPLITTER_PACKAGE_ID });
const transaction = sui.buildTip({
  amountMist: 1_000_000_000n, // 1 SUI, excluding gas
  targetURI: 'https://example.com/post/1',
  receiver: tipTarget.payments.sui.address,
  host: HOST_SUI_ADDRESS,
  ratioBps: 8000,
});

await signAndExecuteTransaction({ transaction });
```

`Tipped` contains the raw `target_uri`, tipper, receiver, host, total amount,
and both split amounts. The transaction digest plus this event is the Sui-side
link from a tip to the SNS action. Sui events do not support EVM-style indexed
event parameters; indexers can derive a URI hash when needed.

## Checks and deployment

```sh
# Compile and run Move tests
sui move build --path sui
sui move test --path sui

# Type-check the PTB builder
cd sui
npm install
npm run typecheck

# Publish only after tests pass; record the returned package ID in frontend config
sui client publish sui
```

Never commit a private key, mnemonic, `.env`, or the returned wallet keystore.
