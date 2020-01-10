// Fund query and data processing functions for Melon from The Graph API
// Use in a FundFetcher instance

import * as moment from 'moment';
import BigNumber from 'bignumber.js';
import { Fund } from '../Fund';
import { fetchSubgraphQuery } from './fetchSubgraphQuery';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import { tokenFetcher } from '../ERC20Fetcher';

// query TheGraph API for fund data and dispatch data processor
// callBack function is called per fund to add to main app
// Awaits fund fetches before returning
export const fetchMelonFunds = async (batch, maxFunds, callBack) => {
  if (batch < 1 || maxFunds < 1) return;
  let fundCount = 0;
  let skip = 0;
  if (batch > maxFunds) batch = maxFunds;
  const promises = [];
  while (fundCount < maxFunds) {
    console.log(`Fetching up to ${batch} funds from Melon subgraph`);
    try {
      var response = await queryMelonSubgraph(batch, skip);
    } catch (e) {
      console.log('Error fetching Melon subgraph', e);
      return;
    }
    const fetchedFunds = response.data.funds;
    if (fetchedFunds === undefined || fetchedFunds.length === 0) break;
    console.log(`Got ${fetchedFunds.length} Melon funds`);
    // build promise array
    for (const fund of fetchedFunds) {
      promises.push(processMelonFund(fund, callBack));
    }
    fundCount += fetchedFunds.length;
    if (fetchedFunds.length < batch) break;
    skip += batch;
  }
  if (fundCount === 0) console.log('Error: No Melon funds found');
  // wait until all promises finish
  await Promise.all(promises);
};

// build and send GraphQL query to The Graph
const queryMelonSubgraph = async (first, skip) => {
  // plus or minus duration from timestamp when querying for fund share price updates
  const timeTolerance = moment.duration(1, 'days').asSeconds();
  const retsTimes = returnsTimestamps();
  let calculationsHistoryQueries = '';
  // build share price queries
  for (const r of Object.keys(retsTimes)) {
    if (r === 'inception')
      calculationsHistoryQueries += `
        inceptionCalcs: calculationsHistory(
          first: 1, 
          orderBy: timestamp, 
          orderDirection: asc
        ) {
          timestamp
          sharePrice
        }
      `;
    else
      calculationsHistoryQueries += `
        ${r}Calcs: calculationsHistory(
          first: 24, 
          orderBy: timestamp, 
          orderDirection: asc, 
          where: {
            timestamp_gte: ${retsTimes[r] - timeTolerance}, 
            timestamp_lte: ${retsTimes[r] + timeTolerance}
          }
        ) {
          timestamp
          sharePrice
        }
      `;
  }
  const query = `{
    funds(
      first: ${first}, 
      skip: ${skip}, 
      orderBy: nav, 
      orderDirection: desc, 
      where: {
        isShutdown: false, nav_gt: 0
      }
    ) {
      name
      nav
      sharePrice
      accounting {
        denominationAsset {
          id
        }
      }
      vault {
        id
      }
      ${calculationsHistoryQueries}
    }
  }`;
  const result = await fetchSubgraphQuery('melonproject/melon', query);
  return result;
};

// Parse fund data for app
const processMelonFund = async (fund, callBack) => {
  // check data expectations
  if (
    !(
      fund !== undefined &&
      fund.hasOwnProperty('name') &&
      fund.name.replace(/\s/g, '') !== '' &&
      fund.hasOwnProperty('accounting') &&
      fund.accounting.hasOwnProperty('denominationAsset') &&
      fund.accounting.denominationAsset.hasOwnProperty('id') &&
      fund.accounting.denominationAsset.id.includes('0x') &&
      fund.hasOwnProperty('vault') &&
      fund.vault.hasOwnProperty('id') &&
      fund.vault.id.includes('0x') &&
      fund.hasOwnProperty('inceptionCalcs') &&
      fund.inceptionCalcs.length > 0 &&
      fund.inceptionCalcs[0].hasOwnProperty('timestamp') &&
      fund.inceptionCalcs[0].timestamp > moment('2017-01-01').unix() &&
      fund.hasOwnProperty('nav') &&
      fund.nav > 0 &&
      fund.hasOwnProperty('sharePrice') &&
      fund.sharePrice > 0
    )
  ) {
    console.log('Error: invalid Melon fund data', fund);
    return;
  }
  // lookup fund denomination asset
  try {
    var denomToken = await tokenFetcher.getTokenByAddress(
      fund.accounting.denominationAsset.id
    );
  } catch (e) {
    console.log(e);
    return;
  }
  // divide by this amount to convert integer values into human readable numbers with decimals
  const decimalsDivisor = BigNumber(10).pow(denomToken.decimals);
  const sharePrices = {
    current: BigNumber(fund.sharePrice).div(decimalsDivisor)
  };
  const retsTimes = returnsTimestamps(fund.inceptionCalcs[0].timestamp);
  // get historical share prices
  for (const r of Object.keys(retsTimes)) {
    sharePrices[r] = getMelonSharePrice(
      fund[r + 'Calcs'],
      denomToken.decimals,
      retsTimes[r]
    );
  }
  // send processed fund to callBack
  await callBack(
    new Fund({
      platformName: 'Melon',
      platformURL: 'https://melonprotocol.com/',
      address: fund.vault.id,
      name: fund.name,
      denomToken,
      inceptionTimestamp: fund.inceptionCalcs[0].timestamp,
      aum: BigNumber(fund.nav).div(decimalsDivisor),
      sharePrices
    })
  );
};

// search a share price query for share price update with closest timestamp
const getMelonSharePrice = (calculationsHistory, decimals, timestamp) => {
  if (calculationsHistory === undefined || calculationsHistory.length === 0)
    return;
  // calculationsHistory should be sorted by timestamp asc
  const closestCalcHistory = calculationsHistory.reduce(
    (best, curr) =>
      Math.abs(curr.timestamp - timestamp) <
      Math.abs(best.timestamp - timestamp)
        ? curr
        : best,
    { timestamp: Number.MAX_SAFE_INTEGER }
  );
  if (
    Math.abs(closestCalcHistory.timestamp - timestamp) >
    moment.duration(2, 'days').asSeconds()
  )
    return;
  return BigNumber(closestCalcHistory.sharePrice).div(
    BigNumber(10).pow(decimals)
  );
};
