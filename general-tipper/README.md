# general-tipper

TipRouter demo: tip any web2 profile (e.g. a Mastodon account) with ETH, split
between the user and the server that hosts them, using addresses both of them
publish themselves. See [firelighter.md](./firelighter.md) for the motivation
and [../contract](../contract) for the `TipSplitter` contract.

## How it works

1. You paste a profile URL.
2. The Cloudflare Worker (`worker/`) fetches it and extracts the receiver
   address from a `ethereum:0x…` string on the page. Tipjars are declared per
   network (`<network>:<address>`), so a profile can also list e.g. `sui:0x…`;
   this client pays on Ethereum only and just displays the others.
3. The Worker fetches `<origin>/.well-known/tip-router` to learn the host's
   tipjars and fee:
   ```json
   { "version": 1, "feeBps": 2000, "tipjars": { "ethereum": "0x…" } }
   ```
   `ratioBps = 10000 - feeBps` is passed to the contract. If the document is
   missing, invalid, or has no `ethereum` tipjar, the host is the zero address
   and the receiver gets 100%.
4. You connect MetaMask and call `TipSplitter.tip(targetURI, receiver, host, ratioBps)`.
5. The app decodes the `Tipped` event from the receipt and links to the explorer.
6. The client verifier re-resolves the tipped URI and checks that the on-chain
   receiver, host and split match what the profile and host advertise now.

## Layout

```
shared/tipRouter.ts   protocol constants, types, parsers (Worker + client)
worker/               resolver API (/api/resolve), SSRF guard, demo fixtures
src/lib/              chain config, ABI, viem clients, tip + verifier logic
src/hooks/            useWallet (MetaMask), useTipFlow (state machine)
src/components/       one card per step
```

Worker routes:

| Route | Purpose |
| --- | --- |
| `GET /api/resolve?url=…` | Resolve a profile URL to `{ targetURI, receiver, host, ratioBps, … }` |
| `GET /demo/@alice` | Fixture profile whose bio contains `ethereum:…` (and a `sui:…`) |
| `GET /demo/@nobody` | Fixture profile without a tipjar (error path) |
| `GET /.well-known/tip-router` | This origin's own tip-router document (fixture host) |

## Local development (Anvil)

```sh
# 1. chain + contract
anvil                                   # terminal A
cd ../contract
forge script script/TipSplitter.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# → TipSplitter deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3

# 2. app
cd ../general-tipper
cp .env.example .env.local              # VITE_CHAIN=anvil, contract address above
cp .dev.vars.example .dev.vars          # ALLOW_PRIVATE_HOSTS=true, demo addresses
npm install
npm run dev                             # http://localhost:5173
```

In MetaMask import Anvil account 0 (the key above). The app adds/switches to
chain 31337 on connect. After restarting `anvil`, clear MetaMask's activity data
so the cached nonce resets.

Then open the app, click "Use the built-in demo profile", resolve, send 1 ETH
and watch the split (0.8 / 0.2) and the verifier checks.

Check balances from the shell:

```sh
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 "balances(address)(uint256)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://127.0.0.1:8545
```

## Sepolia / deploy

```sh
cd ../contract
forge script script/TipSplitter.s.sol --rpc-url $SEPOLIA_RPC --broadcast --private-key $PK

cd ../general-tipper
# .env.production (or shell): VITE_CHAIN=sepolia VITE_TIPSPLITTER_ADDRESS=0x…
# wrangler.jsonc "vars": set DEMO_RECEIVER / DEMO_HOST to addresses you control
npm run deploy
```

## Advertising a tipjar on a real service

- User: put `ethereum:0xYourAddress` in your profile bio (add `sui:0x…` etc. for other networks).
- Host: serve `/.well-known/tip-router` with the JSON above.
- Adding a network: add an entry to `NETWORKS` in `shared/tipRouter.ts` with its
  address normalizer; set `payable: true` once the client can pay on it.

## Scripts

`npm run dev`, `npm run build`, `npm run lint`, `npm run deploy`,
`npm run cf-typegen` (after editing `wrangler.jsonc` vars).
