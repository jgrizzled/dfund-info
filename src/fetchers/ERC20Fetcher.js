// Fetches ERC20 token info from the Ethereum blockchain via the Infura web3 API
// Deduplicates API calls and caches lookups
// Use the singleton export to have all modules share a cache

import Web3 from 'web3'; // Ethereum blockchain API
import { ERC20Abi } from './abi/ERC20.abi';
import { ERC20OldAbi } from './abi/ERC20Old.abi';
import { PromiseDeduper } from 'utils/PromiseDeduper';

// Infura API key
const web3 = new Web3(
  'https://mainnet.infura.io/v3/b89c21c5a5d149d7b38562a7f28f201e'
);

export class ERC20Fetcher {
  constructor() {
    this.tokens = [];
    this.getTokenByAddress = this.getTokenByAddress.bind(this);
    this.promiseDeduper = new PromiseDeduper();
  }
  // external lookup
  async getTokenByAddress(address) {
    let token = this.tokens.find(
      _token => address.toLowerCase() === _token.address.toLowerCase()
    );
    if (token !== undefined) return token;
    token = await this.promiseDeduper.dedupePromise(this._fetchERC20Token, [
      address
    ]);

    if (token !== undefined && token.name !== undefined) {
      this.tokens.push(token);
      return token;
    }
    throw new Error(`Token ${address} not found`);
  }
  // internal method that calls the web3 API
  async _fetchERC20Token(address) {
    console.log('Fetching ERC20 token ' + address);
    const token = { address };
    let name, symbol, decimals;
    try {
      // Try using current ERC20 contract ABI
      const tokenContract = new web3.eth.Contract(ERC20Abi, address);
      [name, symbol, decimals] = await Promise.all([
        tokenContract.methods.name().call(),
        tokenContract.methods.symbol().call(),
        tokenContract.methods.decimals().call()
      ]);
      token.name = name;
      token.symbol = symbol;
      token.decimals = decimals;
    } catch {
      // Try using old ERC20 contract ABI
      const tokenContract = new web3.eth.Contract(ERC20OldAbi, address);
      [name, symbol, decimals] = await Promise.all([
        tokenContract.methods.name().call(),
        tokenContract.methods.symbol().call(),
        tokenContract.methods.decimals().call()
      ]);
      token.name = web3.utils.hexToUtf8(name);
      token.symbol = web3.utils.hexToUtf8(symbol);
      token.decimals = decimals;
    }
    if (
      token.name === undefined ||
      token.symbol === undefined ||
      token.decimals === undefined
    )
      throw new Error('Failed to fetch token ' + address);
    return token;
  }
}

// Singleton
export const tokenFetcher = new ERC20Fetcher();
