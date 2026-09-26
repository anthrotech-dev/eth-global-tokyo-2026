// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title TipSplitter
/// @notice Accepts ETH tips for an off-chain (web2) action identified by a URI and
///         splits the amount between a receiver (the user) and a host (the server that
///         hosts the user). Balances are held in this contract and withdrawn pull-style.
/// @dev    This contract intentionally performs no verification that `targetURI`,
///         `receiver` or `host` correspond to real web2 entities. That is the
///         responsibility of the web2 layer.
contract TipSplitter {
    /// @notice Denominator for basis-point ratios. 10_000 bps == 100%.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Withdrawable ETH balance per account.
    mapping(address => uint256) public balances;

    /// @notice Emitted on every tip.
    /// @param targetURIHash keccak256 of `targetURI`, indexed for efficient filtering.
    /// @param receiver      Account that receives the receiver share.
    /// @param host          Account that receives the host share (may be zero if hostAmount == 0).
    /// @param tipper        msg.sender of the tip.
    /// @param targetURI     Raw URI identifying the web2 action being tipped.
    /// @param amount        Total ETH tipped (msg.value).
    /// @param receiverAmount Portion credited to `receiver`.
    /// @param hostAmount    Portion credited to `host`.
    event Tipped(
        bytes32 indexed targetURIHash,
        address indexed receiver,
        address indexed host,
        address tipper,
        string targetURI,
        uint256 amount,
        uint256 receiverAmount,
        uint256 hostAmount
    );

    /// @notice Emitted when an account withdraws its balance.
    event Withdrawn(address indexed account, uint256 amount);

    error ZeroAmount();
    error InvalidRatio(uint16 ratio);
    error ZeroReceiver();
    error HostRequired();
    error NothingToWithdraw();
    error TransferFailed();

    /// @notice Tip `msg.value` ETH for `targetURI`, splitting it between `receiver` and `host`.
    /// @param targetURI URI identifying the web2 action (e.g. a chat post) being tipped.
    /// @param receiver  Address credited with `ratioBps / 10_000` of the tip. Rounding dust goes here.
    /// @param host      Address credited with the remainder. May be `address(0)` only if its share is 0.
    /// @param ratioBps  Receiver's share in basis points (0..10_000).
    function tip(string calldata targetURI, address receiver, address host, uint16 ratioBps) external payable {
        uint256 amount = msg.value;
        if (amount == 0) revert ZeroAmount();
        if (ratioBps > BPS_DENOMINATOR) revert InvalidRatio(ratioBps);
        if (receiver == address(0)) revert ZeroReceiver();

        uint256 hostAmount = (amount * (BPS_DENOMINATOR - ratioBps)) / BPS_DENOMINATOR;
        uint256 receiverAmount = amount - hostAmount;

        if (host == address(0) && hostAmount > 0) revert HostRequired();

        balances[receiver] += receiverAmount;
        if (hostAmount > 0) {
            balances[host] += hostAmount;
        }

        emit Tipped(
            keccak256(bytes(targetURI)), receiver, host, msg.sender, targetURI, amount, receiverAmount, hostAmount
        );
    }

    /// @notice Withdraw the caller's entire accumulated balance.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
