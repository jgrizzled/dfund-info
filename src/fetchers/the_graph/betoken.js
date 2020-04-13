// Fund query and data processing functions for Betoken from The Graph API
// Use in a FundFetcher instance

import * as moment from 'moment';
import BigNumber from 'bignumber.js';
import { Fund } from '../Fund';
import { fetchSubgraphQuery } from './fetchSubgraphQuery';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import logger from 'logger';

// query TheGraph API for fund data and dispatch data processor
// callBack function is called per fund to add to main app
// Awaits fund fetch before returning
export const fetchBetokenFund = async (batch, maxFunds, callBack) => {
  if (batch < 1 || maxFunds < 1) return;
  logger.log('Fetching fund from Betoken subgraph');
  try {
    var response = await queryBetokenSubgraph();
  } catch (e) {
    logger.log('Error fetching Betoken subgraph', e);
    return;
  }
  const fetchedFund = response.data.funds;
  if (fetchedFund === undefined || fetchedFund.length === 0) {
    logger.log('Error: No Betoken fund found');
    return;
  }
  logger.log('Got Betoken fund');
  await processBetokenFund(fetchedFund[0], callBack);
};

// build and send GraphQL query to The Graph
const queryBetokenSubgraph = async () => {
  const timeTolerance = moment.duration(1, 'days').asSeconds();
  const retsTimes = returnsTimestamps();
  let sharesPriceHistoryQueries = '';
  // build share price queries
  for (const r of Object.keys(retsTimes)) {
    if (r === 'inception')
      sharesPriceHistoryQueries += `
        inceptionSharesPriceHistory: sharesPriceHistory(
          first: 1, 
          orderBy: timestamp, 
          orderDirection: asc
        ) {
          timestamp
          value
        }
      `;
    else
      sharesPriceHistoryQueries += `
        ${r}SharesPriceHistory: sharesPriceHistory(
          first: 3, 
          orderBy: timestamp, 
          orderDirection: asc, 
          where: {
            timestamp_gte: ${retsTimes[r] - timeTolerance}, 
            timestamp_lte: ${retsTimes[r] + timeTolerance}
          }
        ) {
          timestamp
          value
        }
      `;
  }
  const query = `{
    funds(
      first: 1, 
      where: {
        id: "BetokenFund"
      }
    ) {
      address
      aum
      sharesPrice
      ${sharesPriceHistoryQueries}
    }
  }`;
  const result = await fetchSubgraphQuery('betoken/betoken-v1', query);
  return result;
};

// parse fund data
const processBetokenFund = async (fund, callBack) => {
  // check data expectations
  if (
    !(
      fund !== undefined &&
      fund.hasOwnProperty('aum') &&
      fund.aum > 0 &&
      fund.hasOwnProperty('sharesPrice') &&
      fund.sharesPrice > 0 &&
      fund.hasOwnProperty('address') &&
      fund.address.includes('0x') &&
      fund.hasOwnProperty('inceptionSharesPriceHistory') &&
      fund.inceptionSharesPriceHistory.length > 0 &&
      fund.inceptionSharesPriceHistory[0].timestamp >
        moment('2017-01-01').unix()
    )
  ) {
    logger.log('Error: Invalid Betoken data', fund);
    return;
  }
  //Betoken data is denominated in Dai (already decimals-adjusted)
  const denomToken = {
    name: 'Dai',
    symbol: 'DAI',
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    decimals: 0
  };
  // get share prices
  const sharePrices = {
    current: BigNumber(fund.sharesPrice)
  };
  const retsTimes = returnsTimestamps(
    fund.inceptionSharesPriceHistory[0].timestamp
  );
  for (const r of Object.keys(retsTimes)) {
    sharePrices[r] = getBetokenSharePrice(
      fund[r + 'SharesPriceHistory'],
      retsTimes[r]
    );
  }
  await callBack(
    new Fund({
      platformName: 'Betoken',
      platformURL: 'https://betoken.fund//',
      address: fund.address,
      name: 'Betoken v1',
      denomToken,
      inceptionTimestamp: fund.inceptionSharesPriceHistory[0].timestamp,
      aum: BigNumber(fund.aum),
      sharePrices
    })
  );
};

// return closest share price update to timestamp
const getBetokenSharePrice = (sharesPrices, timestamp) => {
  if (sharesPrices === 0) return;
  const closestSharePrice = sharesPrices.reduce(
    (best, curr) =>
      Math.abs(curr.timestamp - timestamp) <
      Math.abs(best.timestamp - timestamp)
        ? curr
        : best,
    { timestamp: Number.MAX_SAFE_INTEGER }
  );
  if (
    Math.abs(closestSharePrice.timestamp - timestamp) >
    moment.duration(2, 'days').asSeconds()
  )
    return;
  return BigNumber(closestSharePrice.value);
};
