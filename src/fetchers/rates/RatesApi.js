// standardized wrapper for an exchange rate API
// handles rate limiting and job deduplication

import * as moment from 'moment';
import { PromiseDeduper } from 'utils/PromiseDeduper';
export class RatesApi {
  constructor(props) {
    this.currentFetcher = props.currentFetcher;
    this.historicalFetcher = props.historicalFetcher;
    this.timeSeriesFetcher = props.timeSeriesFetcher;
    this.key = props.key;
    this.rateLimitTimeout = props.rateLimitTimeout;

    this.promiseDeduper = new PromiseDeduper();
    this.rateLimited = false;
    this.resumeTime = 0;
    this.fetchCurrentRate = this.fetchCurrentRate.bind(this);
    this.fetchHistoricalRate = this.fetchHistoricalRate.bind(this);
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
    if (typeof func !== 'function') return;
    let ret = undefined;
    if (!this.rateLimited || moment() > this.resumeTime) {
      this.rateLimited = false;
      try {
        ret = await this.promiseDeduper.dedupePromise(func, [
          ...args,
          this.key
        ]);
      } catch (e) {
        if (e.message.includes('rate limit')) {
          this.rateLimited = true;
          this.resumeTime = moment().add(this.rateLimitTimeout, 'seconds');
          throw new Error('API rate limited');
        } else throw e;
      }
      return ret;
    }
  }
}
