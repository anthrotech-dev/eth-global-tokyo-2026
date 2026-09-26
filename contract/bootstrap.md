# contract for tipping with split

web2にて行われた特定のアクションに対して、ethereum上でチップを付与するためのスマートコントラクト

## 目的
- スーパーチャットなどのように、ふつうのチャット投稿に対してチップを付与してアップグレードできるようにしたい
- また、分散型SNSのようなweb2の分散型サービスにおいて、tipをユーザーだけでなくそのユーザーをホストしているサーバーにも分配できるようにしたい
- 可能な箇所はすべてweb2側で検証し、web3のレイヤーはできるだけ薄く導入したい。

## 手法
- targetURI(チャットなどweb2上のアクションを特定するためのURI), tipAmount, receiverAddress, hostAddress, ratioを引数として受け取り、tipAmountをreceiverAddressとhostAddressにratioに応じて分配する
- pull型
- コントラクト上ではURIやethアドレスとweb2上の実ユーザーの紐づけの検証は行わない。これはweb2側の責務とする。

