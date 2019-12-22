// Test data for ERC20Fetcher for development

import { ERC20Fetcher } from '../ERC20Fetcher';
export default class ERC20Fetcher_test extends ERC20Fetcher {
  constructor(props) {
    super(props);
    this.getTokenByAddress = this.getTokenByAddress.bind(this);
  }
  async getTokenByAddress(address) {
    return this._fetchERC20Token(address);
  }
  _fetchERC20Token(address) {
    return {
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      name: 'Wrapped Ether',
      decimals: 18,
      symbol: 'WETH'
    };
  }
}

export const tokenFetcher = new ERC20Fetcher_test();
