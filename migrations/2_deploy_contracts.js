const InterestModel = artifacts.require("CommonJumpInterestModel");
const Bencutroller = artifacts.require("Bencutroller");
const wrappedNativeDelegate = artifacts.require("CWrappedNativeDelegate");
const wrappedNativeDelegator = artifacts.require("CWrappedNativeDelegator");
const Unitroller = artifacts.require("Unitroller");
const CompoundLens = artifacts.require("CompoundLens");
const BencuPriceOracle = artifacts.require("BencuPriceOracle");
const BencuConfig = artifacts.require("BencuConfig");
const Maximillion = artifacts.require("Maximillion");
const BlockNumberTool = artifacts.require("BlockNumberTool");

// Mock Tokens
const TetherToken = artifacts.require("TetherToken");
const MockWETH = artifacts.require("MockWETH");

// Parameters
const closeFactor = 0.5e18.toString();
const liquidationIncentive = 1.13e18.toString();
const reserveFactor = 0.3e18.toString();

// 4 * 60 * 24 * 365 (BlockTime: 15s)
let blocksPerYear = 2102400; 

let addressFactory = {};
module.exports = async function(deployer, network) {
    await deployer.deploy(Unitroller);
    await deployer.deploy(Bencutroller);
    await deployer.deploy(CompoundLens);

    if (network == "metistest" || network == "metis") {
        await deployer.deploy(BencuConfig,
            "0x0000000000000000000000000000000000000000", "0x4200000000000000000000000000000000000013");
        addressFactory["BlockNumberTool"] = "0x4200000000000000000000000000000000000013";
    } else {
        await deployer.deploy(BlockNumberTool);
        await deployer.deploy(BencuConfig,
            "0x0000000000000000000000000000000000000000", BlockNumberTool.address);
        addressFactory["BlockNumberTool"] = BlockNumberTool.address;
    }

    addressFactory["Bencutroller"] = Unitroller.address;
    addressFactory["BencuConfig"] = BencuConfig.address;
    addressFactory["CompoundLens"] = CompoundLens.address;

    let unitrollerInstance = await Unitroller.deployed();
    let bencutrollerInstance = await Bencutroller.deployed();
    let bencuConfigInstance = await BencuConfig.deployed();
    let admin = await bencutrollerInstance.admin();
    console.log("admin: ", admin);

    await unitrollerInstance._setPendingImplementation(Bencutroller.address);
    await bencutrollerInstance._become(Unitroller.address);
    await bencuConfigInstance._setPendingSafetyGuardian(admin);
    await bencuConfigInstance._acceptSafetyGuardian();
    const baseRatePerYear = 0.03e18.toString();
    const multiplierPerYear = 0.3e18.toString();
    const jumpMultiplierPerYear = 5e18.toString();
    const kink = 0.95e18.toString();
    const reserveFactor = 0.2e18.toString();

    let proxiedBencutroller = await Bencutroller.at(Unitroller.address);

    await proxiedBencutroller._setBencuConfig(BencuConfig.address);
    console.log("Done to set bencu config.", await  proxiedBencutroller.bencuConfig());

    await proxiedBencutroller._setLiquidationIncentive(liquidationIncentive);
    console.log("Done to set liquidation incentive.");
    let incentive = await proxiedBencutroller.liquidationIncentiveMantissa();
    console.log("New incentive: ", incentive.toString());

    await proxiedBencutroller._setCloseFactor(closeFactor);
    result = await proxiedBencutroller.closeFactorMantissa();
    console.log("Done to set close factor with value: ", result.toString());

    if (network == "metistest" || network == "metis") {
        let metisToken = "0xd52a793Ebb4A895B9Ba7f77D8a3FeEEc565b324e";
        if (network == "metis") {
            metisToken = "0x75cb093E4D61d2A2e65D8e0BBb01DE8d89b53481";
        }
        await deployer.deploy(BencuPriceOracle, metisToken);
        let priceOracleAddress = BencuPriceOracle.address;
        await deployer.deploy(InterestModel, blocksPerYear, baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink);
        addressFactory["InterestRateModel"] = InterestModel.address;
        let proxiedBencutroller = await Bencutroller.at(Unitroller.address);
        await proxiedBencutroller._setPriceOracle(priceOracleAddress);
        console.log("Done to set price oracle.", await proxiedBencutroller.oracle());
        addressFactory["PriceOracle"] = priceOracleAddress;
        await deployer.deploy(wrappedNativeDelegate);
        await deployer.deploy(wrappedNativeDelegator, metisToken, Unitroller.address, InterestModel.address, 0.02e18.toString(), "Bencu Metis", "bMetis", 18, admin, wrappedNativeDelegate.address, "0x0");
        const wrappedNativeInstance = await wrappedNativeDelegator.deployed();
        await wrappedNativeInstance._setReserveFactor(reserveFactor);
        console.log("Done to set reserve factor to %s", reserveFactor);
        await proxiedBencutroller._supportMarket(wrappedNativeDelegator.address);
        console.log("Done to support market bMetis: ", wrappedNativeInstance.address);
        let metisCollateralFactor = 0.5e18.toString();
        await proxiedBencutroller._setCollateralFactor(wrappedNativeInstance.address, metisCollateralFactor);
        console.log("Done to set collateral factor %s for bMetis %s", metisCollateralFactor, wrappedNativeInstance.address);
        addressFactory["bMetis"] = wrappedNativeInstance.address;
        await deployer.deploy(Maximillion, wrappedNativeInstance.address);
        addressFactory["Maximillion"] = Maximillion.address;
    }
    console.log("================= Copy and record below addresses ==============")
    console.log(addressFactory);
};
