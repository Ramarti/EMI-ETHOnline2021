const axios = require('axios')
const hre = require('hardhat')
const enzyme = require('@enzymefinance/protocol')
const ethers = hre.ethers
const fund = require('../deployment/fund.json')
const tokenFilter = require('./tokenfilter.json')
const MAX_TOKENS = 20 // By Enzyme
const ENZYME_UNIVERSE_URL = 'https://services.enzyme.finance/api/enzyme/asset/list'
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/'

const ABIs = {
  VAULT: require('../external_abi/enzyme/VaultLib.json'),
}

let comptrollerContract

async function main() {
  const tokens = await getEnzymeUniverse()
  const filteredTokens = applyBlackList(tokens)
  const tokensWithMarketCap = await getTokensWithMarketcap(filteredTokens)

  const { emiTokens, totalMarketCap } = determineTokensInIndex(tokensWithMarketCap)

  const [signer] = await ethers.getSigners()
  comptrollerContract = new enzyme.ComptrollerLib(fund.comptrollerProxy, signer)

  const gav = await getGav()
  const denAssetPrice = await getDenominationAssetPrice()
  const gavUSD = denAssetPrice * gav
  const emiIndexBalances = emiTokens.map((token) => {
    const emiToken = {}
    emiToken.id = token.id
    emiToken.symbol = token.symbol
    emiToken.marketCap = token.marketCap
    emiToken.targetBalance = (token.marketCap * gavUSD) / totalMarketCap
    return emiToken
  })

  console.log(emiIndexBalances)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function getGav(signer, comptrollerProxyAddress) {
  
  const [gav] = await comptrollerContract.calcGav.args(true).call()

  console.log('gav', gav.toNumber())
  return gav.toNumber()
}

async function getDenominationAssetPrice() {
  // TODO get asset address from the fund
  const response = await axios.get(
    `${COINGECKO_BASE_URL}/simple/token_price/ethereum?contract_addresses=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&vs_currencies=usd`
  )
  return response.data['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'].usd
}

function determineTokensInIndex(tokensWithMarketCap) {
  const emiTokens = []
  // eslint-disable-next-line no-var
  var totalMarketCap = 0
  tokensWithMarketCap.forEach((token) => {
    const oldTotalMarketCap = totalMarketCap
    totalMarketCap += token.marketCap
    if (oldTotalMarketCap / totalMarketCap > 0.01) {
      emiTokens.push(token)
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
  return marketCapped.sort((prev, next) => prev.marketCap >= next.marketCap).slice(0, MAX_TOKENS)
}

async function getEnzymeUniverse() {
  const response = await axios.get(ENZYME_UNIVERSE_URL)
  const tokens = response.data.data.filter((token) => token.type !== 'DERIVATIVE' && token.type !== 'USD')
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

async function tradeOnUniswap(minIncomingAssetAmount, outgoingAssetAmount) {
  const aPath = 'TODO'
  const takeOrderArgs = enzyme.uniswapV2TakeOrderArgs({
    path: aPath, // for example only
    minIncomingAssetAmount: minIncomingAssetAmount, // for example only
    outgoingAssetAmount: outgoingAssetAmount, // for example only
  })

  // assemble and encode the arguments for callOnExtension()
  const callArgs = enzyme.callOnIntegrationArgs({
    adapter: addresses.UNISWAP_V2_ADAPTER,
    selector: enzyme.takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  })
  const swapTx = comptrollerContract.callOnExtension.args(
    addresses.INTEGRATION_MANAGER_ADDRESS,
    enzyme.IntegrationManagerActionId.CallOnIntegration,
    callArgs
  )

  const swapTxReceipt = await swapTx.send()
}
