const axios = require('axios')
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/'
const MAX_TOKENS = 20

async function getMarketDataForAddress(address, symbol) {
  console.log('Getting marketcap for address...', address, symbol)
  const response = await axios.get(
    `${COINGECKO_BASE_URL}/coins/ethereum/contract/${address}/market_chart/?vs_currency=usd&days=1`
  )
  console.log(`${COINGECKO_BASE_URL}/coins/ethereum/contract/${address}/market_chart/?vs_currency=usd&days=1`)
  const marketCaps = response.data.market_caps
  const marketCap = marketCaps[marketCaps.length - 1][1]
  console.log('marketcap', marketCap)
  const prices = response.data.prices
  const price = prices[marketCaps.length - 1][1]
  console.log('price', price)
  return { marketCap, price }
}

async function getTokensWithMarketcap(tokens) {
  const marketCapped = await Promise.all(
    tokens.map(async (token) => {
      const { marketCap, price } = await getMarketDataForAddress(token.id, token.symbol)
      token.marketCap = marketCap
      token.price = price
      return token
    })
  )

  const sorted = marketCapped.sort((prev, next) => next.marketCap - prev.marketCap).slice(0, MAX_TOKENS)
  return sorted
}

module.exports = { getMarketDataForAddress, getTokensWithMarketcap }
