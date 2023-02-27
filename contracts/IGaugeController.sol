pragma solidity ^0.5.16;

interface IGaugeController {
    function notifySavingsChange(address user) external;
}
