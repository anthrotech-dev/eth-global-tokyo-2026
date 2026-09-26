# TipSplitter

web2 上のアクション (チャット投稿など) に対して ETH でチップを付与し、
受取ユーザー (`receiver`) とそのユーザーをホストするサーバー (`host`) に分配するコントラクト。

設計の背景は [bootstrap.md](./bootstrap.md) を参照。

## 特徴

- ネイティブ ETH のみ対応
- pull 型: 分配額はコントラクト内に積まれ、各アドレスが `withdraw()` で引き出す
- ownerless: 管理者・手数料・pause なし
- URI と ETH アドレスの実ユーザー紐づけ検証はコントラクト側では行わない (web2 側の責務)

## インターフェース

```solidity
function tip(string calldata targetURI, address receiver, address host, uint16 ratioBps) external payable;
function withdraw() external;
function balances(address account) external view returns (uint256);
```

### `tip`

| 引数 | 意味 |
| --- | --- |
| `msg.value` | チップ総額 (0 は revert) |
| `targetURI` | チップ対象の web2 アクションを特定する URI |
| `receiver` | ユーザー側の受取アドレス (zero は revert) |
| `host` | サーバー側の受取アドレス。host の取り分が 0 のときだけ zero address 可 |
| `ratioBps` | **receiver 側**の取り分 (basis points, 0..10000)。端数は receiver に寄せる |

例: `ratioBps = 8000` なら receiver 80% / host 20%。

### イベント

```solidity
event Tipped(
    bytes32 indexed targetURIHash, // keccak256(bytes(targetURI))
    address indexed receiver,
    address indexed host,
    address tipper,
    string  targetURI,
    uint256 amount,
    uint256 receiverAmount,
    uint256 hostAmount
);
event Withdrawn(address indexed account, uint256 amount);
```

web2 側は `Tipped` を購読し、`targetURIHash` でフィルタして投稿の表示をアップグレードする。

### エラー

`ZeroAmount`, `InvalidRatio(uint16)`, `ZeroReceiver`, `HostRequired`, `NothingToWithdraw`, `TransferFailed`

## 開発

```sh
forge build
forge test -vvv
forge fmt --check
```

### ローカルデプロイ (Anvil)

```sh
anvil   # 別ターミナル

export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # anvil account 0
forge script script/TipSplitter.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PK

# チップ (receiver 80% / host 20%)
cast send <deployed> "tip(string,address,address,uint16)" \
  "https://example.com/post/1" <receiver> <host> 8000 \
  --value 1ether --rpc-url http://127.0.0.1:8545 --private-key $PK

cast call <deployed> "balances(address)(uint256)" <receiver> --rpc-url http://127.0.0.1:8545

# 引き出し (receiver の鍵で)
cast send <deployed> "withdraw()" --rpc-url http://127.0.0.1:8545 --private-key <receiver の key>
```
