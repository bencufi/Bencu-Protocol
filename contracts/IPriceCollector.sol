pragma solidity ^0.5.16;

contract IPriceCollector {
    function setDirectPrice(address[] memory asset, uint[] memory price) public;
}
