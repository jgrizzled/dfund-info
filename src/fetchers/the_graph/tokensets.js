// Fund query and data processing functions for TokenSets from The Graph API
// Use in a FundFetcher instance

import BigNumber from 'bignumber.js';
import { Fund } from '../Fund';
import { fetchSubgraphQuery } from './fetchSubgraphQuery';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import { tokenFetcher } from '../ERC20Fetcher';
import { priceFetcher } from '../PriceFetcher';
import logger from 'logger';

const setDecimals = 18;
const setDecimalsDivisor = BigNumber(10).pow(setDecimals);

// query TheGraph API for fund data and dispatch data processor
// callBack function is called per fund to add to main app
// Awaits fund fetches before returning
export const fetchTokenSetsFunds = async (batch, maxFunds, callBack) => {
  if (batch < 1 || maxFunds < 1) return;
  let fundCount = 0;
  let skip = 0;
  if (batch > maxFunds) batch = maxFunds;
  const promises = [];
  while (fundCount < maxFunds) {
    logger.log(`Fetching up to ${batch} funds from TokenSets subgraph`);
    try {
      var response = await queryTokenSetsSubgraph(batch, skip);
    } catch (e) {
      logger.error('Cannot fetch TokenSets subgraph ' + e.message + e.stack);
      return;
    }
    const fetchedFunds = response.data.tokenSets;
    if (fetchedFunds === undefined || fetchedFunds.length === 0) break;
    logger.log(`Got ${fetchedFunds.length} TokenSets funds`);
    // keep track of promises
    for (const fund of fetchedFunds) {
      promises.push(processTokenSetsFund(fund, callBack));
    }
    fundCount += fetchedFunds.length;
    if (fetchedFunds.length < batch) break;
    skip += batch;
  }
  if (fundCount === 0) logger.warn('No TokenSets funds found');
  await Promise.all(promises.map(p => p.catch(e => logger.error(e))));
};

// build and send GraphQL query to The Graph
// TODO: handle >1000 rebalances
const queryTokenSetsSubgraph = async (first, skip) => {
  const query = `{
      tokenSets(
        first: ${first},
        skip: ${skip}
      ){
        set_ {
          address
          name
          supply
          units
          naturalUnit
          issuances(first:1 orderBy:timestamp, orderDirection:asc) {
            timestamp
          }
        }
        underlyingSet {
          supply
          components
          units
          naturalUnit
        }
        rebalances(first: 1000, orderBy: timestamp, orderDirection: desc) {
          timestamp
          oldSet {
            units
            components
            naturalUnit
          }
          newSet {
            units
            components
            naturalUnit
          }
        }
      }
  }`;
  const result = await fetchSubgraphQuery('destiner/token-sets', query);
  return result;
};

// Parse fund data for app
const processTokenSetsFund = async (fund, callBack) => {
  // check data expectations
  if (
    !(
      fund !== undefined &&
      fund.hasOwnProperty('set_') &&
      fund.set_.hasOwnProperty('name') &&
      fund.set_.name.replace(/\s/g, '') !== '' &&
      fund.set_.hasOwnProperty('issuances') &&
      fund.set_.issuances.length > 0 &&
      fund.hasOwnProperty('rebalances')
    )
  ) {
    logger.warn('Invalid TokenSets fund data', fund);
    return;
  }
  //TokenSets don't have a concept of a denomination asset, so normalize prices to USD
  const denomToken = {
    name: 'USD',
    symbol: 'USD',
    address: '',
    decimals: 0
  };
  const inceptionTimestamp = fund.set_.issuances[0].timestamp;
  const retsTimes = returnsTimestamps(inceptionTimestamp);
  // calculate share prices for funds with rebalances
  if (fund.rebalances.length > 0) {
    // Calculate units of underlying sets (needed for share price of Rebalancing Set)
    const rebalancesWithUnits = await calcRebalanceUnits(
      fund.set_.units,
      fund.rebalances
    );
    // calc current share price
    const sharePricePromises = {
      current: calcSetSharePrice(fund.rebalances[0].newSet)
    };
    // calc historical share prices
    for (const r in retsTimes) {
      if (retsTimes[r] >= inceptionTimestamp)
        sharePricePromises[r] = getRebalancingSetSharePrice(
          rebalancesWithUnits,
          fund.set_.naturalUnit,
          retsTimes[r]
        );
    }
    var sharePrices = {
      current: (await sharePricePromises.current)
        .times(fund.set_.units)
        .div(fund.set_.naturalUnit)
    };
    for (const r in sharePricePromises) {
      if (r === 'current') continue;
      sharePrices[r] = await sharePricePromises[r];
    }
  } else {
    // calculate share prices for funds without rebalances
    const sharePricePromises = {
      current: calcSetSharePrice(fund.underlyingSet)
    };
    for (const r in retsTimes) {
      if (retsTimes[r] >= inceptionTimestamp)
        sharePricePromises[r] = calcSetSharePrice(
          fund.underlyingSet,
          retsTimes[r]
        );
    }
    var sharePrices = {
      current: (await sharePricePromises.current)
        .times(fund.set_.units)
        .div(fund.set_.naturalUnit)
    };
    for (const r in sharePricePromises) {
      if (r === 'current') continue;
      sharePrices[r] = (await sharePricePromises[r])
        .times(fund.set_.units)
        .div(fund.set_.naturalUnit);
    }
  }
  // Set supply has 18 decimals, divide integer value by 10^18 for human readable decimal number
  const aum = sharePrices.current
    .times(fund.set_.supply)
    .div(setDecimalsDivisor);

  await callBack(
    new Fund({
      platformName: 'TokenSets',
      platformURL: 'https://www.tokensets.com/',
      address: fund.set_.address,
      name: fund.set_.name,
      denomToken,
      inceptionTimestamp: fund.set_.issuances[0].timestamp,
      aum,
      sharePrices
    })
  );
};

// A TokenSet aka Rebalancing set contains shares of an underlying set
// The underlying set holds the assets
// Rebalance events trade the old underlying set for an equivalent amount of shares in the new underlying set
// Currently, the subgraph data does not provide the historical units of an underlying set a Rebalancing set contains
// Historical underlying set units are required to calculate historical share prices
// This function works backwards from the current units data to calculate historical units
const calcRebalanceUnits = async (initialNewSetUnits, rebalances) => {
  // rebalances should be sorted by timestamp descending
  const rebalancesWithUnits = [];
  // work backwards from current Rebalancing Set units
  // share price immediately before and after a rebalance should be equal
  let newRebalancingSetUnits = BigNumber(initialNewSetUnits);
  for (const rebalance of rebalances) {
    // get share prices of new and old underlying sets
    const [newSetSharePrice, oldSetSharePrice] = await Promise.all([
      calcSetSharePrice(rebalance.newSet, rebalance.timestamp),
      calcSetSharePrice(rebalance.oldSet, rebalance.timestamp)
    ]);
    // share price of Rebalancing Set = units of underlying set * underlying set share price
    const newRebalancingSetSharePrice = newSetSharePrice.times(
      newRebalancingSetUnits
    );
    // units of old underlying set = new Rebalancing Set share price * new underlyng set units / old underlying set share price
    const oldRebalancingSetUnits = newRebalancingSetSharePrice.div(
      oldSetSharePrice
    );
    rebalancesWithUnits.push({
      newSet: rebalance.newSet,
      newUnits: newRebalancingSetUnits,
      oldSet: rebalance.oldSet,
      oldUnits: oldRebalancingSetUnits,
      timestamp: rebalance.timestamp
    });
    newRebalancingSetUnits = oldRebalancingSetUnits;
  }
  return rebalancesWithUnits;
};

// sum set component values in USD
const calcSetSharePrice = async (set, timestamp) => {
  const units = set.units;
  const components = set.components;
  const naturalUnit = set.naturalUnit;
  // lookup tokens in set
  const tokens = await Promise.all(
    components.map(c => tokenFetcher.getTokenByAddress(c))
  );
  // lookup exchange rates to USD
  const rates = await Promise.all(
    tokens.map(t => priceFetcher.fetchRate(t.symbol, 'USD', timestamp))
  );
  let sum = BigNumber(0);
  // sum component USD value * units
  for (let i = 0; i < components.length; i++) {
    const decimalsDivisor = BigNumber(10).pow(tokens[i].decimals);
    sum = sum.plus(BigNumber(units[i]).div(decimalsDivisor).times(rates[i]));
  }
  const result = sum.times(setDecimalsDivisor.div(naturalUnit));
  return result;
};

// get historical share price of a Rebalancing Set
const getRebalancingSetSharePrice = async (
  rebalancesWithUnits,
  naturalUnit,
  timestamp
) => {
  // find latest rebalance before timestamp, return new set share price * units
  // if oldest rebalance is later than timestamp, use old set
  let latestRebalance = rebalancesWithUnits[rebalancesWithUnits.length - 1];
  for (let i = 0; i < rebalancesWithUnits.length; i++) {
    if (rebalancesWithUnits[i].timestamp <= timestamp) {
      latestRebalance = rebalancesWithUnits[i];
      break;
    }
  }
  if (latestRebalance.timestamp <= timestamp) {
    var set = latestRebalance.newSet;
    var units = latestRebalance.newUnits;
  } else {
    var set = latestRebalance.oldSet;
    var units = latestRebalance.oldUnits;
  }
  const underlyingSetSharePrice = await calcSetSharePrice(set, timestamp);
  return underlyingSetSharePrice.times(units).div(naturalUnit);
};
