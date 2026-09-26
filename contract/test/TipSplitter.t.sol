// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TipSplitter} from "../src/TipSplitter.sol";

/// @dev Rejects all incoming ETH.
contract RejectingReceiver {
    TipSplitter internal immutable splitter;

    constructor(TipSplitter _splitter) {
        splitter = _splitter;
    }

    function withdraw() external {
        splitter.withdraw();
    }
}

/// @dev Attempts to re-enter `withdraw` during the ETH callback.
contract ReentrantReceiver {
    TipSplitter internal immutable splitter;
    uint256 public reentered;

    constructor(TipSplitter _splitter) {
        splitter = _splitter;
    }

    function withdraw() external {
        splitter.withdraw();
    }

    receive() external payable {
        // Attempt a second withdraw during the callback; must fail with NothingToWithdraw.
        try splitter.withdraw() {
            reentered++;
        } catch {}
    }
}

contract TipSplitterTest is Test {
    TipSplitter internal splitter;

    address internal tipper = makeAddr("tipper");
    address internal receiver = makeAddr("receiver");
    address internal host = makeAddr("host");

    string internal constant URI = "https://example.com/post/1";

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
    event Withdrawn(address indexed account, uint256 amount);

    function setUp() public {
        splitter = new TipSplitter();
        vm.deal(tipper, 100 ether);
    }

    // ---------------------------------------------------------------------
    // tip()
    // ---------------------------------------------------------------------

    function test_Tip_SplitsByRatio_AndEmits() public {
        vm.expectEmit(address(splitter));
        emit Tipped(keccak256(bytes(URI)), receiver, host, tipper, URI, 1 ether, 0.8 ether, 0.2 ether);

        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 8000);

        assertEq(splitter.balances(receiver), 0.8 ether);
        assertEq(splitter.balances(host), 0.2 ether);
        assertEq(address(splitter).balance, 1 ether);
    }

    function test_Tip_RoundingDustGoesToReceiver() public {
        vm.prank(tipper);
        splitter.tip{value: 3}(URI, receiver, host, 5000);

        assertEq(splitter.balances(receiver), 2);
        assertEq(splitter.balances(host), 1);
    }

    function test_Tip_FullRatio_ZeroHostAllowed() public {
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, address(0), 10_000);

        assertEq(splitter.balances(receiver), 1 ether);
        assertEq(splitter.balances(address(0)), 0);
    }

    function test_Tip_FullRatio_NonZeroHostGetsNothing() public {
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 10_000);

        assertEq(splitter.balances(receiver), 1 ether);
        assertEq(splitter.balances(host), 0);
    }

    function test_Tip_ZeroRatio_AllToHost() public {
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 0);

        assertEq(splitter.balances(receiver), 0);
        assertEq(splitter.balances(host), 1 ether);
    }

    function test_Tip_SameReceiverAndHost() public {
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, receiver, 7000);

        assertEq(splitter.balances(receiver), 1 ether);
    }

    function test_Tip_Accumulates() public {
        vm.startPrank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 8000);
        splitter.tip{value: 2 ether}("https://example.com/post/2", receiver, host, 5000);
        vm.stopPrank();

        assertEq(splitter.balances(receiver), 0.8 ether + 1 ether);
        assertEq(splitter.balances(host), 0.2 ether + 1 ether);
    }

    function test_Tip_RevertWhen_ZeroAmount() public {
        vm.prank(tipper);
        vm.expectRevert(TipSplitter.ZeroAmount.selector);
        splitter.tip{value: 0}(URI, receiver, host, 8000);
    }

    function test_Tip_RevertWhen_InvalidRatio() public {
        vm.prank(tipper);
        vm.expectRevert(abi.encodeWithSelector(TipSplitter.InvalidRatio.selector, uint16(10_001)));
        splitter.tip{value: 1 ether}(URI, receiver, host, 10_001);
    }

    function test_Tip_RevertWhen_ZeroReceiver() public {
        vm.prank(tipper);
        vm.expectRevert(TipSplitter.ZeroReceiver.selector);
        splitter.tip{value: 1 ether}(URI, address(0), host, 8000);
    }

    function test_Tip_RevertWhen_HostRequired() public {
        vm.prank(tipper);
        vm.expectRevert(TipSplitter.HostRequired.selector);
        splitter.tip{value: 1 ether}(URI, receiver, address(0), 8000);
    }

    function testFuzz_Tip_Conserves(uint96 amount, uint16 ratioBps) public {
        amount = uint96(bound(amount, 1, type(uint96).max));
        ratioBps = uint16(bound(ratioBps, 0, 10_000));

        vm.deal(tipper, amount);
        vm.prank(tipper);
        splitter.tip{value: amount}(URI, receiver, host, ratioBps);

        uint256 r = splitter.balances(receiver);
        uint256 h = splitter.balances(host);
        assertEq(r + h, amount);
        assertLe(h, amount);
        // host share never exceeds its exact bps share; receiver gets the dust
        assertEq(h, (uint256(amount) * (10_000 - ratioBps)) / 10_000);
    }

    // ---------------------------------------------------------------------
    // withdraw()
    // ---------------------------------------------------------------------

    function test_Withdraw_TransfersAndEmits() public {
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 8000);

        uint256 before = receiver.balance;

        vm.expectEmit(address(splitter));
        emit Withdrawn(receiver, 0.8 ether);

        vm.prank(receiver);
        splitter.withdraw();

        assertEq(receiver.balance - before, 0.8 ether);
        assertEq(splitter.balances(receiver), 0);
        assertEq(address(splitter).balance, 0.2 ether);
    }

    function test_Withdraw_RevertWhen_NothingToWithdraw() public {
        vm.prank(receiver);
        vm.expectRevert(TipSplitter.NothingToWithdraw.selector);
        splitter.withdraw();
    }

    function test_Withdraw_RevertWhen_TransferFails_BalanceKept() public {
        RejectingReceiver rejecting = new RejectingReceiver(splitter);

        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, address(rejecting), host, 10_000);

        vm.expectRevert(TipSplitter.TransferFailed.selector);
        rejecting.withdraw();

        assertEq(splitter.balances(address(rejecting)), 1 ether);
    }

    function test_Withdraw_NoReentrancyDoubleSpend() public {
        ReentrantReceiver attacker = new ReentrantReceiver(splitter);

        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, address(attacker), host, 5000);
        vm.prank(tipper);
        splitter.tip{value: 1 ether}(URI, receiver, host, 5000);

        attacker.withdraw();

        assertEq(address(attacker).balance, 0.5 ether);
        assertEq(attacker.reentered(), 0);
        assertEq(splitter.balances(address(attacker)), 0);
        // other users' funds are untouched
        assertEq(address(splitter).balance, 1.5 ether);
    }

    // ---------------------------------------------------------------------
    // misc
    // ---------------------------------------------------------------------

    function test_DirectEthTransferReverts() public {
        vm.prank(tipper);
        (bool ok,) = address(splitter).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(splitter).balance, 0);
    }
}
