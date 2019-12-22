// test data for PriceFetcher for development

import BigNumber from 'bignumber.js';
import { PriceFetcher } from '../PriceFetcher';
import { RatesApi } from '../rates/RatesApi';

const testRatesApi = new RatesApi({
  currentFetcher: async () => BigNumber(Math.random() * 10000),
  historicalFetcher: async () => BigNumber(Math.random() * 10000),
  key: '',
  rateLimitTimeout: 60
});
const testTimeSeriesApi = new RatesApi({
  timeSeriesFetcher: async () => [],
  key: '',
  rateLimitTimeout: 60
});

export const priceFetcher = new PriceFetcher({
  ratesApi: testRatesApi,
  timeSeriesApi: testTimeSeriesApi
});
