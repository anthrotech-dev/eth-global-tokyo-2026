---
title: Tip Router
description: Tip a resource on an existing web2 service with ETH, split between the user and the server that hosts them, using addresses both of them publish themselves.
---

## Abstract

Tip Router adds a monetization layer to existing web2 services, in particular
federated social networks, without changing how those services work. It
consists of three parts:

1. **Tipjar publication.** A user (receiver) and a server (host) each publish a
   payout address on infrastructure they already control.
2. **Settlement.** A tipper calls `TipSplitter.tip()` with an opaque target URI
   identifying the tipped resource. The contract splits the ETH between
   receiver and host and emits a `Tipped` event. Balances are withdrawn
   pull-style.
3. **Verification.** Any party recomputes the expected arguments from what the
   receiver and host publish and compares them with the transaction.

The contract verifies nothing about URIs or identities. All trust decisions
are made off-chain.

## Motivation

Federated services have no built-in way to pay creators, and existing
solutions either custody funds on the platform, require every user to have a
wallet, or ignore the server operator who bears the hosting cost.

Tip Router lets a tipper attach ETH to a concrete web2 action (a post, a
reaction, a profile), lets the hosting server declare and receive a fee, and
keeps the on-chain layer to a single split-and-hold contract. Because the
receiver and the host advertise their own addresses, no registry or platform
wallet integration is needed to start.

## Specification

The key words "MUST", "MUST NOT", "SHOULD", "MAY" are to be interpreted as
described in RFC 2119.

### 1. Roles

| Role | Description |
| --- | --- |
| **Receiver** | The user who owns the tipped resource. |
| **Host** | The server that hosts the receiver. |
| **Tipper** | The account that sends the tip transaction. |
| **Target URI** | An opaque string identifying the tipped resource. |
| **Tipjar** | A payout address published for a network, e.g. `ethereum`. |

### 2. Address format

Tipjars are keyed by network name so one publication can list several chains.
This version defines the `ethereum` network: `0x` followed by 40 hexadecimal
characters. A mixed-case address MUST carry a valid EIP-55 checksum. The zero
address is invalid. Unknown network names MUST be ignored.

### 3. Receiver tipjar

A receiver publishes a tipjar in one of two forms.

**Inline declaration.** For services with no structured storage (e.g. a
Mastodon bio), the token `ethereum:0x…` placed in text the receiver controls.
It MUST NOT be adjacent to other alphanumeric characters. The first valid
declaration in document order is authoritative.

**Tipjar document.** For services with owner-controlled storage, a JSON object:

```json
{ "tipjars": { "ethereum": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" } }
```

stored where only the receiver can write it. On Concrnt this is the record
`cckv://<ccid>/tipjar` (schema `https://schema.concrnt.world/tipjar.json`).

Absence of a tipjar means the receiver has not opted in. Clients MUST NOT tip
such a receiver and MUST NOT cache tipjars across tips.

### 4. Host document

A host publishes its tipjar and fee at

```
https://<host>/.well-known/tip-router
```

```json
{ "version": 1, "feeBps": 2000, "tipjars": { "ethereum": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" } }
```

| Field | Requirement |
| --- | --- |
| `version` | MUST be `1`. |
| `feeBps` | Integer in `[0, 10000]`. The host's share in basis points. |
| `tipjars` | Object of network name to address, as in section 2. |

`<host>` is the server that hosts the receiver: the origin of the target URL
for a plain web page, or the receiver's home server on services that have one
(on Concrnt, the entity's domain). A client MUST NOT accept a host location
supplied by the tipper or the target itself.

If the document is missing (404) or invalid in any way, the client MUST use the
zero address as `host` and give the receiver 100 %. The receiver share passed
to the contract is:

```
ratioBps = 10000 - feeBps
```

### 5. Target URI

The target URI is an opaque byte string. It is passed to `tip()` and emitted
unchanged, and its hash is `keccak256(bytes(targetURI))`. This specification
does not define URI normalization or equivalence; whether two URIs denote the
same resource is decided by the service that serves them. Any scheme MAY be
used; Concrnt uses the content-addressed `ccfs://…` URI of the tipped action.

### 6. Settlement contract

```solidity
interface ITipSplitter {
    function tip(string calldata targetURI, address receiver, address host, uint16 ratioBps)
        external payable;
    function withdraw() external;
    function balances(address account) external view returns (uint256);

    event Tipped(
        bytes32 indexed targetURIHash,   // keccak256(bytes(targetURI))
        address indexed receiver,
        address indexed host,
        address tipper,
        string  targetURI,
        uint256 amount,
        uint256 receiverAmount,
        uint256 hostAmount
    );
    event Withdrawn(address indexed account, uint256 amount);

    error ZeroAmount();
    error InvalidRatio(uint16 ratio);
    error ZeroReceiver();
    error HostRequired();
    error NothingToWithdraw();
    error TransferFailed();
}
```

`tip()` MUST:

1. Revert `ZeroAmount` if `msg.value == 0`, `InvalidRatio` if
   `ratioBps > 10000`, `ZeroReceiver` if `receiver == address(0)`.
2. Compute `hostAmount = amount * (10000 - ratioBps) / 10000` (rounded down)
   and `receiverAmount = amount - hostAmount`. Dust goes to the receiver.
3. Revert `HostRequired` if `host == address(0)` and `hostAmount > 0`.
4. Credit `balances[receiver]` and, if `hostAmount > 0`, `balances[host]`.
5. Emit `Tipped`.

`withdraw()` MUST zero the caller's balance before transferring, emit
`Withdrawn`, and revert `TransferFailed` (restoring the balance) if the
transfer fails.

The contract MUST be ownerless with no fee, pause or upgrade, MUST NOT accept
plain ETH transfers, and is deployed once per chain. The fee is **not**
enforced on-chain; the contract splits by whatever `ratioBps` the tipper sends.

### 7. Sending a tip

1. Read the receiver's tipjar (section 3) and the host document (section 4).
2. Choose the target URI (section 5).
3. Call `tip(targetURI, receiver, host, ratioBps)` with the tip as value.
   Simulate first so custom errors can be shown.
4. **Sender binding (optional).** If the tipper also has a tipjar on the
   service, the transaction SHOULD be sent from exactly that address, so the
   tip can be attributed to the tipper's social identity.

### 8. Verification

Given a transaction hash, a verifier re-resolves the receiver and host with
the rules above and checks:

| Check | Condition |
| --- | --- |
| success | `receipt.status == success` |
| contract | `tx.to == TipSplitter` on the expected chain |
| function | calldata decodes as `tip(...)` (or the receipt holds one `Tipped` from that address) |
| target | `targetURI` equals the expected URI, byte for byte |
| receiver | `receiver` equals the receiver's current tipjar |
| host | `host` equals the host document's tipjar, or the zero address if none |
| ratio | `ratioBps == 10000 - feeBps` (or `10000` if no host) |
| value | `amount > 0` |
| sender | if sender binding applies: `tx.from` equals the tipper's tipjar |

The displayed amount MUST be the on-chain value, never a value declared
off-chain. A failed check does not prove fraud (a tipjar may have changed
since); clients SHOULD show the tip demoted rather than hide it.

