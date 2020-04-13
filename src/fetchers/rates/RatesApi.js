// standardized wrapper for an exchange rate API
// handles rate limiting and job deduplication

import { PromiseDeduper } from 'utils/PromiseDeduper';

export class RatesApi {
  constructor(props) {
    this.currentFetcher = props.currentFetcher;
    this.historicalFetcher = props.historicalFetcher;
    this.timeSeriesFetcher = props.timeSeriesFetcher;
    this.rateLimitTimeout = props.rateLimitTimeout;
    this.retries = props.retries;

    this.promiseDeduper = new PromiseDeduper();
    this.fetchCurrentRate = this.fetchCurrentRate.bind(this);
    this.fetchHistoricalRate = this.fetchHistoricalRate.bind(this);
    this.fetchTimeSeries = this.fetchTimeSeries.bind(this);
  }

  fetchCurrentRate(baseSymbol, quoteSymbol) {
    return this._fetchData(this.currentFetcher, [baseSymbol, quoteSymbol]);
  }

  fetchHistoricalRate(baseSymbol, quoteSymbol, timestamp) {
    return this._fetchData(this.historicalFetcher, [
      baseSymbol,
      quoteSymbol,
      timestamp
    ]);
  }

  fetchTimeSeries(baseSymbol, quoteSymbol, timestamp) {
    return this._fetchData(this.timeSeriesFetcher, [
      baseSymbol,
      quoteSymbol,
      timestamp
    ]);
  }

  async _fetchData(func, args) {
    if (typeof func !== 'function') throw new Error('function not provided');

    let tries = 0;
    while (tries++ < this.retries) {
      try {
        return await this.promiseDeduper.dedupePromise(func, args);
      } catch (e) {
        if (e.message.includes('rate limit'))
          await timeout(this.rateLimitTimeout);
        else throw e;
      }
    }

    throw new Error(`API rate limited at ${func.name}(${args.join(',')})`);
  }
}

const timeout = s => new Promise(resolve => setTimeout(resolve, s * 1000));
