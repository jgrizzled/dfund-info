// Test data for FundFetcher for development

import { FundFetcher } from '../FundFetcher';
import { Fund } from '../Fund';
import { tokenFetcher } from './ERC20Fetcher-test';
import BigNumber from 'bignumber.js';
import * as moment from 'moment';
import { returnsTimestamps } from 'utils/returnsTimestamps';

const numTestFunds = 100;

const testFundFetcher = async (batchSize, maxFunds, callBack) => {
  const testTokenAddr = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const funds = [];
  for (let i = 0; i < numTestFunds; i++) {
    const inceptionTimestamp = moment()
      .subtract(Math.random() * 100, 'days')
      .unix();
    const sharePrices = { current: BigNumber(Math.random()) };
    for (const r of Object.keys(returnsTimestamps(inceptionTimestamp))) {
      sharePrices[r] = BigNumber(Math.random());
    }
    funds.push(
      new Fund({
        name: 'Test Fund ' + i,
        address: '0x' + i,
        denomToken: await tokenFetcher.getTokenByAddress(testTokenAddr),
        aum: sharePrices.current.times(10),
        inceptionTimestamp,
        platformName: 'Melon',
        platformURL: '#',
        sharePrices
      })
    );
  }
  await Promise.all(funds.map(f => callBack(f)));
  return;
};

export const fundFetcher = new FundFetcher({
  fundPlatformFetchers: [testFundFetcher],
  maxFunds: 1000,
  batchSize: 100
});
