pragma solidity ^0.5.16;

import "./compound/PriceOracle.sol";
import "./compound/CErc20.sol";
import "./IPriceCollector.sol";
import "./BToken.sol";
import "./compound/SafeMath.sol";
import "./ChainlinkAggregatorV3Interface.sol";

contract TenderPriceOracle is PriceOracle, IPriceCollector {
    struct ErrorInfo {
        uint timestamp;
        uint previousPrice;
        uint errPrice;
        address priceAdmin;
    }

    struct PriceInfo {
        uint price;
        uint updatedAt;
        address reportedBy;
    }
    mapping(address => PriceInfo) public prices;
    mapping(address => bool) public priceAdmin;
    address public governance;
    mapping(address => ErrorInfo) public errorInfo;
    mapping(address => bool) public errorHappened;
    bool public paused = false;
    address public wrappedNativeToken;

    using SafeMath for uint;

    event PricePosted(address asset, uint previousPriceMantissa, uint requestedPriceMantissa, uint newPriceMantissa);
    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event PriceAdminAdded(address newAdmin);
    event PriceAdminRemoved(address newAdmin);
    event PriceAlert(address priceAdmin, address asset, uint previousPriceMantissa, uint newPriceMantissa);
    event AssetPriceSourceUpdated(address indexed asset, address indexed source);

    modifier onlyPriceAdmin {
        require(priceAdmin[msg.sender], "Price Admin required.");
        _;
    }

    modifier onlyGovernance {
        require(msg.sender == governance, "Governance required.");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(address _wrappedNativeToken) public {
        governance = msg.sender;
        priceAdmin[governance] = true;
        wrappedNativeToken = _wrappedNativeToken;
    }

    function getUnderlyingPrice(CToken cToken) public view returns (uint) {
        if (BToken(address(cToken)).isNativeToken()) {
            return 1e18;
        } else {
            address asset = address(CErc20(address(cToken)).underlying());
            uint assetDecimals = CErc20(address(asset)).decimals();
            uint nativeTokenPriceInUsd = prices[wrappedNativeToken].price;
            uint assetPriceInUsd = prices[address(CErc20(address(cToken)).underlying())].price;

            if (assetPriceInUsd == 0 || nativeTokenPriceInUsd == 0) {
                return 0;
            }
            uint assetPriceInNativeToken = assetPriceInUsd.mul(10 ** 18).mul(10 ** 18).div(nativeTokenPriceInUsd.mul(10 ** assetDecimals));
            return assetPriceInNativeToken;
        }
    }

    function setUnderlyingPrice(CToken cToken, uint underlyingPriceMantissa) public onlyPriceAdmin {
        address asset = address(CErc20(address(cToken)).underlying());
        setDirectPrice(asset, underlyingPriceMantissa);
    }

    function isValidPrice(address _asset, uint _price) public view returns (bool) {
        // initial price is 0
        if (prices[_asset].price == 0) return true;

        uint min = prices[_asset].price.div(2);
        uint max = prices[_asset].price.mul(2);

        return _price > min && _price < max;
    }

    function setDirectPrice(address _asset, uint _price) public onlyPriceAdmin whenNotPaused {
        uint previousPrice = prices[_asset].price;
        uint newPrice = _price;
        if (isValidPrice(_asset, _price)) {
            prices[_asset] = PriceInfo(newPrice, block.timestamp, msg.sender);
            emit PricePosted(_asset, previousPrice, newPrice,  prices[_asset].price);
        } else {
            errorInfo[_asset] = ErrorInfo(block.timestamp, previousPrice, newPrice, msg.sender);
            errorHappened[_asset] = true;
            emit PriceAlert(msg.sender, _asset, previousPrice, newPrice);
        }
    }

    function setDirectPrice(address[] memory _assets, uint[] memory _prices) public onlyPriceAdmin whenNotPaused {
        require(_assets.length > 0, "At least one asset price is required");
        require(_assets.length == _prices.length, "Assets and prices are not match");

        for (uint i = 0; i < _assets.length; i++) {
            setDirectPrice(_assets[i], _prices[i]);
        }
    }

    function setPrice(address _asset, uint _price) private onlyPriceAdmin {
        uint previousPrice = prices[_asset].price;
        uint newPrice = _price;
        prices[_asset] = PriceInfo(newPrice, block.timestamp, msg.sender);
        emit PricePosted(_asset, previousPrice, newPrice,  prices[_asset].price);
    }

    function setDirectPriceWithForce(address[] memory _assets, uint[] memory _prices) public onlyPriceAdmin {
        require(_assets.length > 0, "At least one asset price is required");
        require(_assets.length == _prices.length, "Assets and prices are not match");

        for (uint i = 0; i < _assets.length; i++) {
            setPrice(_assets[i], _prices[i]);
        }
    }

    function assetPrices(address asset) external view returns (uint) {
        return prices[asset].price;
    }

    function getPriceInfo(address asset) external view returns (uint price, uint updatedAt, address reportedBy) {
        price = prices[asset].price;
        updatedAt = prices[asset].updatedAt;
        reportedBy = prices[asset].reportedBy;
    }

    function addPriceAdmin(address newPriceAdmin) public onlyGovernance {
        priceAdmin[newPriceAdmin] = true;
        emit PriceAdminAdded(newPriceAdmin);
    }

    function removePriceAdmin(address newPriceAdmin) public onlyGovernance {
        priceAdmin[newPriceAdmin] = false;
        emit PriceAdminRemoved(newPriceAdmin);
    }

    function setPaused(bool _paused) public onlyGovernance {
        paused = _paused;
    }

    function setErrorHappened(address asset, bool happened) public onlyGovernance {
        errorHappened[asset] = happened;
    }

    function transferGovernance(address newGovernance) public onlyGovernance {
        require(newGovernance != address(0), "Governance address should not be zero");
        emit GovernanceTransferred(governance, newGovernance);
        governance = newGovernance;
    }
}
