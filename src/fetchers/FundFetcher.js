// Fund fetching module
// Dispatches fund platform fetchers
// Use singleton

import BigNumber from 'bignumber.js';
import { fetchMelonFunds } from './the_graph/melon';
import { fetchBetokenFund } from './the_graph/betoken';
import { fetchTokenSetsFunds } from './the_graph/tokensets';
import logger from 'logger';

export class FundFetcher {
  constructor(props) {
    this.fundPlatformFetchers = props.fundPlatformFetchers;
    this.maxFunds = props.maxFunds;
    this.batchSize = props.batchSize;
    this.fundCount = 0;
  }
  // dispatch fund fetchers and await
  async fetchFunds(callBack) {
    const promises = this.fundPlatformFetchers.map(fetcher =>
      fetcher(this.batchSize, this.maxFunds, callBack)
    );
    await Promise.all(promises.map(p => p.catch(logger.error)));
  }

  // sort Fund objects
  sortFunds(funds, sortProp, isAscending) {
    const asc = isAscending ? 1 : -1;
    funds.sort((a, b) => {
      let aProp, bProp;
      if (sortProp.includes('.')) {
        const props = sortProp.split('.');
        aProp = props.reduce((prev, curr) => prev && prev[curr], a);
        bProp = props.reduce((prev, curr) => prev && prev[curr], b);
      } else {
        aProp = a[sortProp];
        bProp = b[sortProp];
      }
      if (aProp instanceof BigNumber && bProp instanceof BigNumber) {
        if (aProp.isNaN() || bProp.isNaN())
          return (aProp.isNaN() - bProp.isNaN()) * asc;
        return aProp.minus(bProp).toNumber() * asc;
      }
      if (typeof aProp === 'number' && typeof bProp === 'number') {
        if (isNaN(aProp) || isNaN(bProp))
          return (isNaN(aProp) - isNaN(bProp)) * asc;
        return (aProp - bProp) * asc;
      }
      if (typeof aProp === 'string' && typeof bProp === 'string') {
        return (
          aProp.localeCompare(bProp, 'en-US', { sensitivity: 'base' }) * asc
        );
      }
      const isInvalid = x => x === undefined || x === null;
      return (!isInvalid(aProp) - !isInvalid(bProp)) * asc;
    });
  }
}

// singleton
export const fundFetcher = new FundFetcher({
  fundPlatformFetchers: [
    fetchMelonFunds,
    fetchTokenSetsFunds,
    fetchBetokenFund
  ],
  maxFunds: 1000,
  batchSize: 100
});
