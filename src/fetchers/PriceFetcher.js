// Crypto price fetching module
// Uses RatesApi instances to dispatch API calls
// Deduplicates and caches rate lookups
// Use singleton to share cache in modules

import * as moment from 'moment';
import BigNumber from 'bignumber.js';
import { cryptoCompare } from './rates/cryptoCompare';
import { alphaVantage } from './rates/alphaVantage';

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
    this._storeRate = this._storeRate.bind(this);
    this._lookupRate = this._lookupRate.bind(this);
  }
  // check cache for rate or call API
  async fetchRate(_denomSymbol, _quoteSymbol, timestamp) {
    // TODO find cUSDC rate API
    if (_denomSymbol.toUpperCase() === 'CUSDC') return BigNumber(0.021);
    const denomSymbol = this.normalizeTokenSymbol(_denomSymbol);
    const quoteSymbol = this.normalizeTokenSymbol(_quoteSymbol);
    if (denomSymbol == quoteSymbol) return BigNumber(1);
    let rate = undefined;
    if (timestamp === undefined) {
      const todaysDate = moment().format('YYYY-MM-DD');
      rate = this._lookupRate(denomSymbol, quoteSymbol, todaysDate);
      if (rate !== undefined) return rate;
      return await this._fetchCurrentRate(denomSymbol, quoteSymbol);
    } else {
      const date = moment.unix(timestamp).format('YYYY-MM-DD');
      rate = this._lookupRate(denomSymbol, quoteSymbol, date);
      if (rate !== undefined) return rate;
      return await this._fetchHistoricalRate(
        denomSymbol,
        quoteSymbol,
        timestamp
      );
    }
  }
  // fetch time series, return and cache results
  // Warning: no caching if called a second time for same pair
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
      ETH: ['WETH'],
      USD: ['DAI', 'USDC', 'USDT', 'GUSD', 'PAX']
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
    let rate = undefined;
    rate = await this.ratesApi.fetchCurrentRate(denomSymbol, quoteSymbol);
    const date = moment().format('YYYY-MM-DD');
    this._storeRate(rate, denomSymbol, quoteSymbol, date);
    return rate;
  }
  // call RatesApi for historical rate
  async _fetchHistoricalRate(denomSymbol, quoteSymbol, timestamp) {
    let rate = undefined;
    rate = await this.ratesApi.fetchHistoricalRate(
      denomSymbol,
      quoteSymbol,
      timestamp
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
