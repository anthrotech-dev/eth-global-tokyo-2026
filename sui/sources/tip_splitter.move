module tip_splitter::tip_splitter;

use std::string::String;
use sui::coin::{Self, Coin};
use sui::event;
use sui::transfer;
use sui::tx_context::{Self, TxContext};
#[test_only]
use std::string;
#[test_only]
use sui::sui::SUI;
#[test_only]
use sui::test_scenario as ts;

const BPS_DENOMINATOR: u64 = 10_000;
const E_ZERO_AMOUNT: u64 = 0;
const E_INVALID_RATIO: u64 = 1;
const E_ZERO_RECEIVER: u64 = 2;
const E_HOST_REQUIRED: u64 = 3;

/// Sui equivalent of the EVM `Tipped` event.
public struct Tipped has copy, drop {
    target_uri: String,
    receiver: address,
    host: address,
    tipper: address,
    amount: u64,
    receiver_amount: u64,
    host_amount: u64,
}

/// Distributes a submitted tip coin with the same allocation maths as EVM.
/// It deliberately holds no shared state or funds after execution.
public fun tip<T>(
    payment: Coin<T>,
    target_uri: String,
    receiver: address,
    host: address,
    ratio_bps: u16,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, E_ZERO_AMOUNT);
    assert!((ratio_bps as u64) <= BPS_DENOMINATOR, E_INVALID_RATIO);
    assert!(receiver != @0x0, E_ZERO_RECEIVER);

    let host_amount = (amount * (BPS_DENOMINATOR - (ratio_bps as u64))) / BPS_DENOMINATOR;
    let receiver_amount = amount - host_amount;
    assert!(host_amount == 0 || host != @0x0, E_HOST_REQUIRED);

    let mut payment = payment;
    if (host_amount == 0) {
        transfer::public_transfer(payment, receiver);
    } else {
        let host_coin = coin::split(&mut payment, host_amount, ctx);
        if (receiver_amount == 0) {
            coin::destroy_zero(payment);
        } else {
            transfer::public_transfer(payment, receiver);
        };
        transfer::public_transfer(host_coin, host);
    };

    event::emit(Tipped {
        target_uri,
        receiver,
        host,
        tipper: tx_context::sender(ctx),
        amount,
        receiver_amount,
        host_amount,
    });
}

#[test_only]
const TIPPER: address = @0xA;
#[test_only]
const RECEIVER: address = @0xB;
#[test_only]
const HOST: address = @0xC;

#[test]
fun test_tip_splits_80_20() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(100, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"https://example.com/post/1"), RECEIVER, HOST, 8000, scenario.ctx());
    scenario.next_tx(RECEIVER);
    let receiver_coin: Coin<SUI> = scenario.take_from_sender();
    assert!(coin::value(&receiver_coin) == 80, 10);
    scenario.return_to_sender(receiver_coin);
    scenario.next_tx(HOST);
    let host_coin: Coin<SUI> = scenario.take_from_sender();
    assert!(coin::value(&host_coin) == 20, 11);
    scenario.return_to_sender(host_coin);
    scenario.end();
}

#[test]
fun test_tip_rounding_dust_goes_to_receiver() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(3, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"tip"), RECEIVER, HOST, 5000, scenario.ctx());
    scenario.next_tx(RECEIVER);
    let receiver_coin: Coin<SUI> = scenario.take_from_sender();
    assert!(coin::value(&receiver_coin) == 2, 12);
    scenario.return_to_sender(receiver_coin);
    scenario.next_tx(HOST);
    let host_coin: Coin<SUI> = scenario.take_from_sender();
    assert!(coin::value(&host_coin) == 1, 13);
    scenario.return_to_sender(host_coin);
    scenario.end();
}

#[test]
fun test_tip_full_ratio_allows_zero_host() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(100, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"tip"), RECEIVER, @0x0, 10_000, scenario.ctx());
    scenario.next_tx(RECEIVER);
    let receiver_coin: Coin<SUI> = scenario.take_from_sender();
    assert!(coin::value(&receiver_coin) == 100, 14);
    scenario.return_to_sender(receiver_coin);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = E_ZERO_AMOUNT)]
fun test_tip_rejects_zero_amount() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(0, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"tip"), RECEIVER, HOST, 8000, scenario.ctx());
    scenario.end();
}

#[test]
#[expected_failure(abort_code = E_INVALID_RATIO)]
fun test_tip_rejects_invalid_ratio() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(100, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"tip"), RECEIVER, HOST, 10_001, scenario.ctx());
    scenario.end();
}

#[test]
#[expected_failure(abort_code = E_HOST_REQUIRED)]
fun test_tip_requires_host_when_it_has_a_share() {
    let mut scenario = ts::begin(TIPPER);
    let payment = coin::mint_for_testing<SUI>(100, scenario.ctx());
    tip<SUI>(payment, string::utf8(b"tip"), RECEIVER, @0x0, 8000, scenario.ctx());
    scenario.end();
}
