const InterestModel = artifacts.require("JumpInterestModel");
const Tendertroller = artifacts.require("Tendertroller");
const wrappedNativeDelegate = artifacts.require("CWrappedNativeDelegate");
const wrappedNativeDelegator = artifacts.require("CWrappedNativeDelegator");
const Unitroller = artifacts.require("Unitroller");
const CompoundLens = artifacts.require("CompoundLens");
const TenderPriceOracle = artifacts.require("TenderPriceOracle");
const TenderConfig = artifacts.require("TenderConfig");
const Maximillion = artifacts.require("Maximillion");

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
    await deployer.deploy(Tendertroller);
    await deployer.deploy(CompoundLens);
    await deployer.deploy(TenderConfig, "0x0000000000000000000000000000000000000000");

    addressFactory["Tendertroller"] = Unitroller.address;
    addressFactory["TenderConfig"] = TenderConfig.address;
    addressFactory["CompoundLens"] = CompoundLens.address;

    let unitrollerInstance = await Unitroller.deployed();
    let tendertrollerInstance = await Tendertroller.deployed();
    let tenderConfigInstance = await TenderConfig.deployed();
    let admin = await tendertrollerInstance.admin();
    console.log("admin: ", admin);

    await unitrollerInstance._setPendingImplementation(Tendertroller.address);
    await tendertrollerInstance._become(Unitroller.address);
    await tenderConfigInstance._setPendingSafetyGuardian(admin);
    await tenderConfigInstance._acceptSafetyGuardian();
    const baseRatePerYear = 0.03e18.toString();
    const multiplierPerYear = 0.3e18.toString();
    const jumpMultiplierPerYear = 5e18.toString();
    const kink = 0.95e18.toString();
    const reserveFactor = 0.2e18.toString();

    let proxiedTendertroller = await Tendertroller.at(Unitroller.address);

    await proxiedTendertroller._setTenderConfig(TenderConfig.address);
    console.log("Done to set tender config.", await  proxiedTendertroller.tenderConfig());

    await proxiedTendertroller._setLiquidationIncentive(liquidationIncentive);
    console.log("Done to set liquidation incentive.");
    let incentive = await proxiedTendertroller.liquidationIncentiveMantissa();
    console.log("New incentive: ", incentive.toString());

    await proxiedTendertroller._setCloseFactor(closeFactor);
    result = await proxiedTendertroller.closeFactorMantissa();
    console.log("Done to set close factor with value: ", result.toString());

    if (network == "metistest" || network == "metis") {
        let metisToken = "0xd52a793Ebb4A895B9Ba7f77D8a3FeEEc565b324e";
        if (network == "metis") {
            metisToken = "0x75cb093E4D61d2A2e65D8e0BBb01DE8d89b53481";
        }
        await deployer.deploy(TenderPriceOracle, metisToken);
        let priceOracleAddress = TenderPriceOracle.address;
        await deployer.deploy(InterestModel, blocksPerYear, baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink);
        addressFactory["InterestRateModel"] = InterestModel.address;
        let proxiedTendertroller = await Tendertroller.at(Unitroller.address);
        await proxiedTendertroller._setPriceOracle(priceOracleAddress);
        console.log("Done to set price oracle.", await proxiedTendertroller.oracle());
        addressFactory["PriceOracle"] = priceOracleAddress;
        await deployer.deploy(wrappedNativeDelegate);
        await deployer.deploy(wrappedNativeDelegator, metisToken, Unitroller.address, InterestModel.address, 0.02e18.toString(), "Tender Metis", "bMetis", 18, admin, wrappedNativeDelegate.address, "0x0");
        const wrappedNativeInstance = await wrappedNativeDelegator.deployed();
        await wrappedNativeInstance._setReserveFactor(reserveFactor);
        console.log("Done to set reserve factor to %s", reserveFactor);
        await proxiedTendertroller._supportMarket(wrappedNativeDelegator.address);
        console.log("Done to support market bMetis: ", wrappedNativeInstance.address);
        let metisCollateralFactor = 0.5e18.toString();
        await proxiedTendertroller._setCollateralFactor(wrappedNativeInstance.address, metisCollateralFactor);
        console.log("Done to set collateral factor %s for bMetis %s", metisCollateralFactor, wrappedNativeInstance.address);
        addressFactory["bMetis"] = wrappedNativeInstance.address;
        await deployer.deploy(Maximillion, wrappedNativeInstance.address);
        addressFactory["Maximillion"] = Maximillion.address;
    }
    console.log("================= Copy and record below addresses ==============")
    console.log(addressFactory);
};
