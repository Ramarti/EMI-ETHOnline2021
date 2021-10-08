// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const enzyme = require("@enzymefinance/protocol");
const { BigNumber } = require("@ethersproject/bignumber");

const ethers = hre.ethers;
const ABIs = {
  FUND_DEPLOYER: require("../external_abi/enzyme/FundDeployer.json"),
};
const addresses = {
  FUND_DEPLOYER: "0x7e6d3b1161DF9c9c7527F68d651B297d2Fdb820B",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
};

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const [ownerSigner] = await ethers.getSigners();
  const timelock24h = 86400;
  const feesPolicies =
    "0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000000000007e8e91fcf0ad73e20adee711eb9e21fe65b90e600000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000033b2e3ca43cbacbde873158"; //await FundDeployer.createNewFund(owner, 'EMI', addresses.DAI, timelock24h, bytes _feeManagerConfigData, bytes _policyManagerConfigData)

  console.log("Instantiating fun deployer in ", addresses.FUND_DEPLOYER);
  const fundDeployer = new ethers.Contract(
    addresses.FUND_DEPLOYER,
    ABIs.FUND_DEPLOYER,
    ownerSigner
  );
  console.log("Connected");
  console.log("fundDeployer owner", await fundDeployer.getOwner())
  console.log("Creating fund...");
  const comptrollerAddress = await fundDeployer.callStatic.createNewFund(
    ownerSigner.address,
    "EMI",
    addresses.DAI,
    BigNumber.from(`${timelock24h}`),
    feesPolicies,
    "0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  );
  console.log("ComptrollerAddress", comptrollerAddress);
  
  const tx = await fundDeployer.callStatic.createNewFund(
    ownerSigner.address,
    "EMI",
    addresses.DAI,
    BigNumber.from(`${timelock24h}`),
    feesPolicies,
    "0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    //"0x00000000000000000000000000000000000000000000000000000000000000"
  );
  console.log("tx", tx);
  await tx.wait();
  console.log("tx finished", tx);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
