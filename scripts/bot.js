const axios = require('axios')
const hre = require('hardhat')
const fs = require('fs')
const ethers = hre.ethers
const { parseEther, formatEther } = ethers.utils
const enzyme = require('@enzymefinance/protocol')
const { getTradeDetails, estimateSellTokenAmountForTarget } = require('./utils/uniswapHelpers.js')

const fund = require('../deployment/fund.json')
const tokenFilter = require('./tokenfilter.json')
const MAX_TOKENS = 20 // By Enzyme
const ENZYME_UNIVERSE_URL = 'https://services.enzyme.finance/api/enzyme/asset/list'
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/'

// TODO take this out to constant file in utils
const ABIs = {
  VAULT: require('../external_abi/enzyme/VaultLib.json'),
  TOKEN: require('../external_abi/wrappedETH.json'), // we just need balanceOf, should be its own ABI maybe
}

const addresses = {
  UNISWAP_V2_ADAPTER: '0x8481150a0f36c98EE859e6C7B46d61FDD836768f',
  INTEGRATION_MANAGER: '0x965ca477106476B4600562a2eBe13536581883A6',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
}

let comptrollerContract
//   console.log(calculateTargetBalance(12966457527.7087, parseEther('352039.0'), 78698197842.66219))

async function main() {
  // Init comptroller
  const [signer] = await ethers.getSigners()
  comptrollerContract = new enzyme.ComptrollerLib(fund.comptrollerProxy, signer)

  const tokens = await getEnzymeUniverse()
  const filteredTokens = applyBlackList(tokens)

  const tokensWithMarketCap = await getTokensWithMarketcap(filteredTokens)
  const { emiTokens, totalMarketCap } = determineTokensInIndex(tokensWithMarketCap)
  console.log(totalMarketCap)


  const emiIndexBalances = await calculateEMIBalances(emiTokens, totalMarketCap)
  console.log(emiIndexBalances)
  // const emiIndexBalancesWithEstimations = await estimateWethCosts(emiIndexBalances)
  saveIndexOutput(emiIndexBalances)
  // await initialTrades(emiIndexBalances)
  // TODO: trades between indexed tokens for subsequent runs

  checkActualEMIBalances(emiIndexBalances, signer)

  console.log('Traded!')
  await getGav()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

function checkActualEMIBalances(emiIndexBalances, signer) {
  emiIndexBalances.forEach(async (token) => {
    const tokenContract = new ethers.Contract(token.id, ABIs.TOKEN, signer)
    const balance = await tokenContract.balanceOf(fund.vaultProxy)
    token.actualBalance = balance.toString()
  })
}

async function calculateEMIBalances(emiTokens, totalMarketCap) {
  const gavInEth = await getGav()
  const gav = gavInEth.mul(parseEther('1'))
  const denAssetPrice = await getDenominationAssetPrice()
  console.log('denAssetPrice', denAssetPrice)
  const gavUSD = parseEther(`${denAssetPrice}`).mul(gav).div(parseEther('1'))
  console.log('denAssetPrice', formatEther(gavUSD))

  const emiIndexBalances = emiTokens.map((token) => {
    const emiToken = {}
    // console.log(token)
    emiToken.id = token.id
    emiToken.symbol = token.symbol
    emiToken.name = token.name
    emiToken.marketCap = token.marketCap
    emiToken.decimals = token.decimals
    emiToken.targetBalance = calculateTargetBalance(token.marketCap, gavUSD, totalMarketCap)
    return emiToken
  })
  return emiIndexBalances
}

function calculateTargetBalance(tokenMarketCap, gavUSD, totalMarketCap) {
  const tokenMC = parseEther(`${tokenMarketCap}`)
  const total = parseEther(`${totalMarketCap}`)
  return formatEther(tokenMC.mul(gavUSD).div(total))
}

async function getGav() {
  const [gav] = await comptrollerContract.calcGav.args(true).call()

  console.log('gav', gav.toNumber())
  return gav
}

async function getDenominationAssetPrice() {
  // TODO get asset address from the fund
  const response = await axios.get(
    `${COINGECKO_BASE_URL}/simple/token_price/ethereum?contract_addresses=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&vs_currencies=usd`
  )
  return response.data['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'].usd
}

function determineTokensInIndex(tokensWithMarketCap) {
  console.log(tokensWithMarketCap)
  const emiTokens = []
  // eslint-disable-next-line no-var
  var totalMarketCap = 0
  tokensWithMarketCap.forEach((token) => {
    if (totalMarketCap === 0) {
      // console.log('Adding token to index', token)
      totalMarketCap += token.marketCap
      emiTokens.push(token)
    } else {
      const oldTotalMarketCap = totalMarketCap
      totalMarketCap += token.marketCap
      if (oldTotalMarketCap / totalMarketCap > 0.01) {
        // console.log('Adding token to index', token)
        emiTokens.push(token)
      }
    }
  })
  return { emiTokens, totalMarketCap }
}

async function getTokensWithMarketcap(tokens) {
  const marketCapped = await Promise.all(
    tokens.map(async (token) => {
      token.marketCap = await getMarketCapForAddress(token.id, token.symbol)
      return token
    })
  )

  const sorted = marketCapped.sort((prev, next) => next.marketCap - prev.marketCap).slice(0, MAX_TOKENS)
  return sorted
}

async function getEnzymeUniverse() {
  const response = await axios.get(ENZYME_UNIVERSE_URL)
  const tokens = response.data.data
  return tokens
}

function applyBlackList(tokens) {
  const exclusionList = tokenFilter.filter((token) => token.reason !== '')

  const blacklist = {}
  exclusionList.forEach((token) => {
    blacklist[token.id] = token
  })
  return tokens.filter((token) => {
    const blackListEntry = blacklist[token.id]
    return !blackListEntry
  })
}

async function getMarketCapForAddress(address, symbol) {
  console.log('Getting marketcap for address...', address, symbol)
  const response = await axios.get(
    `${COINGECKO_BASE_URL}/coins/ethereum/contract/${address}/market_chart/?vs_currency=usd&days=1`
  )
  const marketCaps = response.data.market_caps
  const mostRecent = marketCaps[marketCaps.length - 1]
  const marketCap = mostRecent[mostRecent.length - 1]
  console.log('marketcap', marketCap)
  return marketCap
}

async function tradeOnUniswapV2(buyToken, sellToken, targetPurchase) {
  const { path, outgoingAssetAmount, minIncomingAssetAmount } = await getTradeDetails(
    buyToken,
    sellToken,
    targetPurchase
  )
  const takeOrderArgs = enzyme.uniswapV2TakeOrderArgs({
    path: path,
    minIncomingAssetAmount: minIncomingAssetAmount,
    outgoingAssetAmount: outgoingAssetAmount,
  })
  console.log('Order Args')
  console.log(takeOrderArgs)

  // assemble and encode the arguments for callOnExtension()
  const callArgs = enzyme.callOnIntegrationArgs({
    adapter: addresses.UNISWAP_V2_ADAPTER,
    selector: enzyme.takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  })
  console.log(callArgs)
  const swapTx = comptrollerContract.callOnExtension.args(
    addresses.INTEGRATION_MANAGER,
    enzyme.IntegrationManagerActionId.CallOnIntegration,
    callArgs
  )
  const gasLimit = (await swapTx.estimate()).mul(10).div(9)
  console.log(swapTx)
  const swapTxReceipt = await swapTx.gas(gasLimit).send()
  const finishedReceipt = await comptrollerContract.provider.waitForTransaction(swapTxReceipt.transactionHash)
  console.log('Swapped!!')
  console.log(finishedReceipt)
}

async function initialTrades(emiIndexBalances) {
  const sellToken = {
    id: addresses.WETH,
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18,
  }
  // const buyToken = emiIndexBalances[0]
  for (const buyToken of emiIndexBalances) {
    await tradeOnUniswapV2(sellToken, buyToken, parseEther(`${buyToken.targetBalance}`).toString())
  }
}

function estimateWethCosts(emiIndexBalances) {
  const sellToken = {
    id: addresses.WETH,
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18,
  }
  // const buyToken = emiIndexBalances[0]
  return emiIndexBalances.map(async (buyToken) => {
    const inputAmount = await estimateSellTokenAmountForTarget(sellToken, buyToken, buyToken.targetBalance)
    buyToken.estimatedWETHCost = formatEther(inputAmount)
    return buyToken
  })
}

function saveIndexOutput(results) {
  const saveJson = JSON.stringify(results, null, 4)
  const filePath = './EMI_output.json'
  fs.writeFileSync(filePath, saveJson, 'utf8')
  return filePath
}
