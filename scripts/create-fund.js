// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const enzyme = require('@enzymefinance/protocol')
const ethers = hre.ethers
const fs = require('fs')
const { BigNumber } = ethers

const ABIs = {
  FUND_DEPLOYER: require('../external_abi/enzyme/FundDeployer.json'),
  VAULT: require('../external_abi/enzyme/VaultLib.json'),
  WETH: require('../external_abi/wrappedETH.json'),
}
const addresses = {
  FUND_DEPLOYER: '0x7e6d3b1161DF9c9c7527F68d651B297d2Fdb820B',
  MANAGEMENT_FEE: '0x45f1b268cc6412b454dae20f8971fc4a36af0d29',
  PERFORMANCE_FEE: '0x3c3f9143A15042B69eB314Cac211688A4E71a087',
  ENTRANCE_BURN_FEE: '0x27F74B89B29508091014487253d8D9b88aa0264A',
  ASSET_BLACKLIST: '0xdC1e40174ad831e505E8191881A66e90c3681E33',
  DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
}

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const [ownerSigner] = await ethers.getSigners()
  const timelock24h = '86400'

  console.log('Instantiating fun deployer in ', addresses.FUND_DEPLOYER)
  const fundDeployer = new ethers.Contract(addresses.FUND_DEPLOYER, ABIs.FUND_DEPLOYER, ownerSigner)
  console.log('Connected')
  console.log('Creating fee config...')
  const feeManagerConfig = createFeeConfig()
  console.log('Creating policy config...')

  const policyManagerConfig = createPoliciesConfig()

  console.log('Creating fund...')
  const tx = await fundDeployer.createNewFund(
    ownerSigner.address,
    'EMI',
    addresses.WETH,
    BigNumber.from(timelock24h),
    feeManagerConfig,
    policyManagerConfig
  )

  const receipt = await tx.wait()
  const { comptrollerProxy, vaultProxy } = receipt.events.filter((event) => event.event === 'NewFundCreated')[0].args

  console.log('Fund created!')
  const toSave = { comptrollerProxy, vaultProxy }

  console.log('Saving deployed addressess...', toSave)
  console.log('Saved to file', saveDeployment(toSave))

  console.log('Seeding fund...')
  await sendInitialDepositToFund(ownerSigner, '100', comptrollerProxy)
  const vault = new ethers.Contract(vaultProxy, ABIs.VAULT, ownerSigner)
  console.log('owner', ownerSigner.address)
  
  console.log('accessor', await vault.getAccessor())
  console.log('trackedAssets', await vault.getTrackedAssets())

  console.log('Finished!')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

function saveDeployment(results) {
  const saveJson = JSON.stringify(results, null, 4)
  const filePath = './deployment/fund.json'
  fs.writeFileSync(filePath, saveJson, 'utf8')
  return filePath
}

function getTokenBlacklist() {
  return [addresses.DAI]
}

function createPoliciesConfig() {
  // policies
  // const maxConcentrationSettings = enzyme.maxConcentrationArgs(utils.parseEther('1'))
  // const adapterBlacklistSettings = enzyme.adapterBlacklistArgs([])
  // const adapterWhitelistSettings = enzyme.adapterWhitelistArgs([])
  // TODO get from TCR contract
  const assetBlacklistSettings = enzyme.assetBlacklistArgs(getTokenBlacklist())

  const policyManagerConfig = enzyme.policyManagerConfigArgs({
    policies: [
      // fork.deployment.maxConcentration,
      // fork.deployment.adapterBlacklist,
      // fork.deployment.adapterWhitelist,
      addresses.ASSET_BLACKLIST,
    ],
    settings: [
      // maxConcentrationSettings,
      // adapterBlacklistSettings,
      // adapterWhitelistSettings,
      assetBlacklistSettings,
    ],
  })
  return policyManagerConfig
}

function createFeeConfig() {
  const rate = ethers.utils.parseEther('0.01')
  const scaledPerSecondRate = enzyme.convertRateToScaledPerSecondRate(rate)
  const managementFeeSettings = enzyme.managementFeeConfigArgs(scaledPerSecondRate)
  /*
  const performanceFeeSettings = enzyme.performanceFeeConfigArgs({
    rate: utils.parseEther('0.0'),
    period: 365 * 24 * 60 * 60,
  })
  */
  // const entranceRateFeeSettings = enzyme.entranceRateFeeConfigArgs(ethers.utils.parseEther('0.0'))

  const feeManagerConfig = enzyme.feeManagerConfigArgs({
    fees: [
      addresses.MANAGEMENT_FEE,
      //  addresses.PERFORMANCE_FEE,
      //  addresses.ENTRANCE_BURN_FEE
    ],
    settings: [
      managementFeeSettings,
      // performanceFeeSettings,
      // entranceRateFeeSettings
    ],
  })
  return feeManagerConfig
}

async function sendInitialDepositToFund(signer, ethAmount, vaultComptrollerAddress) {
  console.log(`Wrapping ${ethAmount} Ether...`)
  const etherAmount = ethers.utils.parseEther(ethAmount)
  const weth = new ethers.Contract(addresses.WETH, ABIs.WETH, signer)
  const wrapTx = await weth.deposit({ value: etherAmount })
  await wrapTx.wait()
  console.log('Wrapped')

  console.log('Approving WETH...')
  const approveTx = await weth.approve(vaultComptrollerAddress, etherAmount)
  await approveTx.wait()
  console.log('Approved')
  const comptrollerContract = new enzyme.ComptrollerLib(vaultComptrollerAddress, signer)
  console.log('Buying shares...')

  const investTx = comptrollerContract.buyShares.args([signer.address], [ethAmount], [BigNumber.from('0')])
  await investTx.send()
  //console.log(investTxReceipt)
  console.log('Bought shares!')
  const [gav] = await comptrollerContract.calcGav.args(true).call()
  console.log('Gross Asset Value:', gav.toString(), 'ETH')
}
