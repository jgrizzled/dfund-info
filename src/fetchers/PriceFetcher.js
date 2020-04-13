// Crypto price fetching module
// Uses RatesApi instances to dispatch API calls
// Deduplicates and caches rate lookups
// Use singleton to share cache in modules

import * as moment from 'moment';
import BigNumber from 'bignumber.js';
import { cryptoCompare } from './rates/cryptoCompare';
import { alphaVantage } from './rates/alphaVantage';
import { isPosBN } from 'utils/isBigNumber';
import logger from 'logger';

export class PriceFetcher {
  constructor(props) {
    this.ratesApi = props.ratesApi;
    this.timeSeriesApi = props.timeSeriesApi;
    // caches exchange rate lookups of daily closes
    // array of {date: yyyy-mm-dd, rates: {}}
    // Ex rateCache[0].rates.USD.BTC = BTC quoted in USD
    this.rateCache = [];
    this.fetchRate = this.fetchRate.bind(this);
    this.fetchTimeSeries = this.fetchTimeSeries.bind(this);
    this._fetchCurrentRate = this._fetchCurrentRate.bind(this);
    this._fetchHistoricalRate = this._fetchHistoricalRate.bind(this);
    this._storeRate = this._storeRate.bind(this);
    this._lookupRate = this._lookupRate.bind(this);
  }

  // check cache for rate or call API
  async fetchRate(_denomSymbol, _quoteSymbol, timestamp) {
    let denomSymbol = this.normalizeTokenSymbol(_denomSymbol);
    let quoteSymbol = this.normalizeTokenSymbol(_quoteSymbol);
    const usdLike = ['USDC', 'DAI', 'USDT', 'GUSD', 'PAX'];

    let adjustment = 1;
    const compoundRate = 0.02;
    const compoundTokens = ['CDAI', 'CUSDC', 'CETH'];
    // TODO: fix Compound token historical prices
    // CryptoCompare currently returns 0 for CDAI (╯°□°)╯︵ ┻━┻
    // Wont include interest
    if (compoundTokens.includes(denomSymbol)) {
      adjustment = compoundRate;
      denomSymbol = compoundTokens.find(i => i === denomSymbol).substr(1);
    }
    if (compoundTokens.includes(denomSymbol)) {
      adjustment = 1 / compoundRate;
      quoteSymbol = compoundTokens.find(i => i === quoteSymbol).substr(1);
    }

    // lookup USD-like tokens as USD to reduce fetches
    if (denomSymbol !== 'USD' && usdLike.includes(denomSymbol))
      denomSymbol = 'USD';

    if (quoteSymbol !== 'USD' && usdLike.includes(quoteSymbol))
      quoteSymbol = 'USD';

    // assume 1 for USD stablecoins to reduce fetches
    if (
      denomSymbol === quoteSymbol ||
      (quoteSymbol === 'USD' && usdLike.includes(denomSymbol)) ||
      (denomSymbol === 'USD' && usdLike.includes(quoteSymbol))
    )
      return BigNumber(1).times(adjustment);

    let rate, date, fetcher;
    if (timestamp === undefined) {
      date = moment().format('YYYY-MM-DD');
      fetcher = this._fetchCurrentRate;
    } else {
      date = moment.unix(timestamp).format('YYYY-MM-DD');
      fetcher = this._fetchHistoricalRate;
    }
    rate = this._lookupRate(denomSymbol, quoteSymbol, date);
    if (isPosBN(rate)) return rate.times(adjustment);
    try {
      return (await fetcher(denomSymbol, quoteSymbol, timestamp)).times(
        adjustment
      );
    } catch (e) {
      if (quoteSymbol === 'USD') {
        // Try to get some USD-like quotes
        for (const k of usdLike) {
          try {
            const [p1, p2] = await Promise.all([
              fetcher(denomSymbol, k, timestamp),
              fetcher(k, 'USD', timestamp)
            ]);
            if (isPosBN(p1) && isPosBN(p2))
              return p1.times(p2).times(adjustment);
          } catch (e) {
            if (e.message.includes('rate limit')) throw e;
            logger.warn(e);
          }
        }
        throw new Error(
          `Failed to find USD rate for ${denomSymbol}: ${e.message} - ${e.stack}`
        );
      }
      throw e;
    }
  }

  // fetch time series, return and cache results
  // Warning: does not cache
  // TODO: handle retries
  async fetchTimeSeries(denomSymbol, quoteSymbol) {
    let _rates = undefined;
    _rates = await this.timeSeriesApi.fetchTimeSeries(denomSymbol, quoteSymbol);
    _rates.forEach(rate => {
      this._storeRate(
        rate.rates[quoteSymbol][denomSymbol],
        denomSymbol,
        quoteSymbol,
        rate.date
      );
    });
    return _rates;
  }

  //normalize symbols for price lookup
  normalizeTokenSymbol(_symbol) {
    const symbol = _symbol.toUpperCase();
    const symbolLookup = {
      BTC: ['WBTC', 'TBTC', 'imBTC'],
      ETH: ['WETH']
    };
    for (const normalSymbol of Object.keys(symbolLookup)) {
      if (symbolLookup[normalSymbol].includes(symbol)) return normalSymbol;
    }
    return symbol;
  }

  // lookup rate in cache
  _lookupRate(denomSymbol, quoteSymbol, date) {
    const dateRates = this.rateCache.find(_rates => _rates.date === date);
    if (dateRates === undefined) return;
    for (const _quoteSymbol of Object.keys(dateRates.rates)) {
      if (
        _quoteSymbol === quoteSymbol &&
        dateRates.rates[quoteSymbol].hasOwnProperty(denomSymbol)
      )
        return dateRates.rates[quoteSymbol][denomSymbol];
      if (
        _quoteSymbol === denomSymbol &&
        dateRates.rates[denomSymbol].hasOwnProperty(quoteSymbol)
      )
        return BigNumber(1).div(dateRates.rates[denomSymbol][quoteSymbol]);
      if (
        dateRates.rates[_quoteSymbol].hasOwnProperty(quoteSymbol) &&
        dateRates.rates[_quoteSymbol].hasOwnProperty(denomSymbol)
      )
        return dateRates.rates[_quoteSymbol][denomSymbol].div(
          dateRates.rates[_quoteSymbol][quoteSymbol]
        );
    }
  }

  // store rate in cache
  _storeRate(rate, denomSymbol, quoteSymbol, date) {
    const ratesIndex = this.rateCache.findIndex(_rates => _rates.date === date);
    if (ratesIndex === -1) {
      this.rateCache.push({
        date,
        rates: {
          [quoteSymbol]: {
            [denomSymbol]: rate
          }
        }
      });
      return;
    }
    if (this.rateCache[ratesIndex].rates.hasOwnProperty(quoteSymbol)) {
      if (
        !this.rateCache[ratesIndex].rates[quoteSymbol].hasOwnProperty(
          denomSymbol
        )
      )
        this.rateCache[ratesIndex].rates[quoteSymbol][denomSymbol] = rate;
    } else
      this.rateCache[ratesIndex].rates[quoteSymbol] = {
        [denomSymbol]: rate
      };
  }

  // call RatesApi for current rate
  async _fetchCurrentRate(denomSymbol, quoteSymbol) {
    let rate = await this.ratesApi.fetchCurrentRate(denomSymbol, quoteSymbol);
    if (!isPosBN(rate))
      throw new Error(
        `Invalid data for ${denomSymbol}/${quoteSymbol}: ${rate}`
      );
    const date = moment().format('YYYY-MM-DD');
    this._storeRate(rate, denomSymbol, quoteSymbol, date);
    return rate;
  }

  // call RatesApi for historical rate
  async _fetchHistoricalRate(denomSymbol, quoteSymbol, timestamp) {
    let rate = await this.ratesApi.fetchHistoricalRate(
      denomSymbol,
      quoteSymbol,
      timestamp
    );
    if (!isPosBN(rate))
      throw new Error(
        `Invalid data for ${denomSymbol}/${quoteSymbol}: ${rate}`
      );
    const date = moment.unix(timestamp).format('YYYY-MM-DD');
    this._storeRate(rate, denomSymbol, quoteSymbol, date);
    return rate;
  }
}

// singleton
export const priceFetcher = new PriceFetcher({
  ratesApi: cryptoCompare,
  timeSeriesApi: alphaVantage
});
