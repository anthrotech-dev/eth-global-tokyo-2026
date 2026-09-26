// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {TipSplitter} from "../src/TipSplitter.sol";

contract TipSplitterScript is Script {
    function run() external returns (TipSplitter splitter) {
        vm.startBroadcast();
        splitter = new TipSplitter();
        vm.stopBroadcast();

        console.log("TipSplitter deployed at:", address(splitter));
    }
}
