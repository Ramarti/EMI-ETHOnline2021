# Ethereum Market index
0. Install dependencies
```shell
npm install
```
1. Put your values in .env, following .env.example

2. Launch mainnet fork node in a terminal (will open node RPC at `http://127.0.0.1:8545/`)
```shell
npx hardhat node
```

3. In another terminal, launch fund creation script
```shell
npx hardhat run scripts/create-fund.js
```
This will create a fund with the defined fees and token blacklist, and will save the deployed contract's addresses in  `/deployment/fund.json` for use in the other scripts


4. launch bot  script
```shell
npx hardhat run scripts/bot.js
```
This will get enzyme universe, filter 20 tokens using blacklist criteria and sort by marketcap, determining target balances with fund GAV, then perform trades to reflect this 

