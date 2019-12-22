// Fund fetching module
// Dispatches fund platform fetchers
// Use singleton

import BigNumber from 'bignumber.js';
import { fetchMelonFunds } from './the_graph/melon';
import { fetchBetokenFund } from './the_graph/betoken';
import { fetchTokenSetsFunds } from './the_graph/tokensets';

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
    await Promise.all(promises);
  }

  // sort Fund objects
  sortFunds(funds, sortProp, isAscending) {
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
      if (aProp !== undefined && bProp === undefined)
        return isAscending ? 1 : -1;
      if (aProp === undefined && bProp !== undefined)
        return isAscending ? -1 : 1;
      if (aProp instanceof BigNumber) {
        if (aProp.lt(bProp)) return isAscending ? -1 : 1;
        if (aProp.gt(bProp)) return isAscending ? 1 : -1;
      } else {
        if (aProp < bProp) return isAscending ? -1 : 1;
        if (aProp > bProp) return isAscending ? 1 : -1;
      }
      return 0;
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
