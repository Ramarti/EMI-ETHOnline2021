const { parseEther } = require('@ethersproject/units')
const UNISWAP = require('@uniswap/sdk')
const { Fetcher, Route, Token, ChainId, TokenAmount, TradeType, Trade } = UNISWAP
const hre = require('hardhat')
const { utils } = hre.ethers

function convertToUniswapTokenModels(sellToken, buyToken) {
  const outgoingToken = new Token(
    ChainId.MAINNET,
    utils.getAddress(sellToken.id),
    sellToken.decimals,
    sellToken.symbol,
    sellToken.name
  )

  const incomingToken = new Token(
    ChainId.MAINNET,
    utils.getAddress(buyToken.id),
    buyToken.decimals,
    buyToken.symbol,
    buyToken.name
  )
  return { outgoingToken, incomingToken }
}

async function getTradeDetails(sellToken, buyToken, targetPurchase) {
  const { outgoingToken, incomingToken } = convertToUniswapTokenModels(sellToken, buyToken)

  const pair0 = await Fetcher.fetchPairData(outgoingToken, incomingToken)
  const route = new Route([pair0], outgoingToken)

  const sellTokenAmount = await estimateSellTokenAmountForTarget(sellToken, buyToken, targetPurchase)
  const tokenOutAmount = new TokenAmount(outgoingToken, sellTokenAmount.toString())
  const trade = new Trade(route, tokenOutAmount, TradeType.EXACT_INPUT)
  console.log('Trade', trade)
  const outgoingAssetAmount = utils.parseUnits(
    trade.inputAmount.toFixed(trade.route.input.decimals),
    trade.route.input.decimals
  )

  const minIncomingAssetAmount = utils
    .parseUnits(trade.outputAmount.toFixed(trade.route.output.decimals), trade.route.output.decimals)
    .mul(98)
    .div(100)

  const path = trade.route.path.map((token) => token.address)
  console.log(path)
  return { path, outgoingAssetAmount, minIncomingAssetAmount }
}

async function estimateSellTokenAmountForTarget(sellToken, buyToken, targetPurchase) {
  console.log(sellToken)
  console.log(buyToken)
  console.log(targetPurchase)
  const { outgoingToken, incomingToken } = convertToUniswapTokenModels(sellToken, buyToken)

  const pair = await Fetcher.fetchPairData(outgoingToken, incomingToken)
  const route = new Route([pair], outgoingToken)

  const trade = new Trade(
    route,
    new TokenAmount(incomingToken, parseEther(`${targetPurchase}`).toString()),
    TradeType.EXACT_OUTPUT
  )
  console.log('trade', trade)
  return trade.inputAmount
}

module.exports = { getTradeDetails, estimateSellTokenAmountForTarget, convertToUniswapTokenModels }
