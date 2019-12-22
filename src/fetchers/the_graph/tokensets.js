// Fund query and data processing functions for TokenSets from The Graph API
// Use in a FundFetcher instance

import BigNumber from 'bignumber.js';
import { Fund } from '../Fund';
import { fetchSubgraphQuery } from './fetchSubgraphQuery';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import { tokenFetcher } from '../ERC20Fetcher';
import { priceFetcher } from '../PriceFetcher';

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
    console.log(`Fetching up to ${batch} funds from TokenSets subgraph`);
    try {
      var response = await queryTokenSetsSubgraph(batch, skip);
    } catch (e) {
      console.log('Error fetching TokenSets subgraph', e);
      return;
    }
    const fetchedFunds = response.data.tokenSets;
    if (fetchedFunds === undefined || fetchedFunds.length === 0) break;
    console.log(`Got ${fetchedFunds.length} TokenSets funds`);
    // keep track of promises
    for (const fund of fetchedFunds) {
      promises.push(processTokenSetsFund(fund, callBack));
    }
    fundCount += fetchedFunds.length;
    if (fetchedFunds.length < batch) break;
    skip += batch;
  }
  if (fundCount === 0) console.log('Error: No TokenSets funds found');
  await Promise.all(promises);
};

// build and send GraphQL query to The Graph
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
          }
          newSet {
            units
            components
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
    console.log('Error: invalid TokenSets fund data', fund);
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
    const sharePricePromises = [calcSetSharePrice(fund.rebalances[0].newSet)];
    // calc historical share prices
    for (const r of Object.keys(retsTimes)) {
      if (retsTimes[r] >= inceptionTimestamp)
        sharePricePromises.push(
          getRebalancingSetSharePrice(rebalancesWithUnits, retsTimes[r])
        );
    }
    const sharePriceResults = await Promise.all(sharePricePromises);
    var sharePrices = {
      current: sharePriceResults[0].times(fund.set_.units)
    };
    let i = 1;
    for (const r of Object.keys(retsTimes)) {
      if (retsTimes[r] >= inceptionTimestamp) {
        sharePrices[r] = sharePriceResults[i];
        i++;
      }
    }
  } else {
    // calculate share prices for funds without rebalances
    const sharePricePromises = [calcSetSharePrice(fund.underlyingSet)];
    for (const r of Object.keys(retsTimes)) {
      if (retsTimes[r] >= inceptionTimestamp)
        sharePricePromises.push(
          calcSetSharePrice(fund.underlyingSet, retsTimes[r])
        );
    }
    const sharePriceResults = await Promise.all(sharePricePromises);
    var sharePrices = { current: sharePriceResults[0].times(fund.set_.units) };
    let i = 1;
    for (const r of Object.keys(retsTimes)) {
      if (retsTimes[r] >= inceptionTimestamp) {
        sharePrices[r] = sharePriceResults[i].times(fund.set_.units);
        i++;
      }
    }
  }
  // Set supply has 18 decimals, divide integer value by 10^18 for human readable decimal number
  const setDecimalsDivisor = BigNumber(10).pow(18);
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
    const price = rates[i].times(BigNumber(units[i]).div(decimalsDivisor));
    sum = sum.plus(price);
  }
  return sum;
};

// get historical share price of a Rebalancing Set
const getRebalancingSetSharePrice = async (rebalancesWithUnits, timestamp) => {
  // find latest rebalance before timestamp, return new set share price * units
  // if oldest rebalance is later than timestamp, use old set
  let latestRebalance = rebalancesWithUnits[rebalancesWithUnits.length - 1];
  for (let i = 0; i < rebalancesWithUnits.length; i++) {
    if (rebalancesWithUnits[i].timestamp <= timestamp) {
      latestRebalance = rebalancesWithUnits[i];
      break;
    }
  }
  if (latestRebalance.timestamp <= timestamp)
    return (await calcSetSharePrice(latestRebalance.newSet, timestamp)).times(
      latestRebalance.newUnits
    );
  return (await calcSetSharePrice(latestRebalance.oldSet, timestamp)).times(
    latestRebalance.oldUnits
  );
};
