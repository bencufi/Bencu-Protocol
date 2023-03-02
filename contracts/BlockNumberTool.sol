pragma solidity ^0.5.16;

import "./iOVM_L1BlockNumber.sol";

/**
 * @title iOVM_L1BlockNumber
 */
contract BlockNumberTool is iOVM_L1BlockNumber {

    function getL1BlockNumber() external view returns (uint256) {
        return block.number;
    }
}
