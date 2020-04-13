// Crypto exchange rate fetchers for CryptoCompare
// use RatesAPI instance

import BigNumber from 'bignumber.js';
import { isPosBN } from 'utils/isBigNumber';
import { RatesApi } from './RatesApi';
import config from 'config';
const { cryptoCompareAPIkey } = config;
import logger from 'logger';

// fetch current exchange rate of a pair
const fetchCurrentRate = async (denomSymbol, quoteSymbol) => {
  logger.log(
    `Fetching current rate for ${denomSymbol}/${quoteSymbol} from CryptoCompare`
  );
  const response = await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${denomSymbol}&tsyms=${quoteSymbol}&api_key=${cryptoCompareAPIkey}`
  );
  if (!response.ok)
    throw new Error('CryptoCompare response error: ' + response.status);
  const responseJSON = await response.json();
  if (responseJSON.Response === 'Error')
    throw new Error(
      `CryptoCompare API error for ${denomSymbol}/${quoteSymbol}: ${responseJSON.Message}`
    );
  if (responseJSON[quoteSymbol]) {
    const rate = BigNumber(responseJSON[quoteSymbol]);
    if (isPosBN(rate)) return rate;
    throw new Error(
      `CryptoCompare unexpected rate data for ${denomSymbol}/${quoteSymbol}: ${responseJSON[quoteSymbol]}`
    );
  }
  throw new Error(
    `CryptoCompare rate not found for ${denomSymbol}/${quoteSymbol}`
  );
};

// fetch historical rate at a timestamp of a pair
const fetchHistoricalRate = async (denomSymbol, quoteSymbol, timestamp) => {
  logger.log(
    `Fetching historical rate for ${denomSymbol}/${quoteSymbol} at ${timestamp} from CryptoCompare`
  );
  const response = await fetch(
    `https://min-api.cryptocompare.com/data/pricehistorical?fsym=${denomSymbol}&tsyms=${quoteSymbol}&ts=${timestamp}&api_key=${cryptoCompareAPIkey}`
  );
  if (!response.ok)
    throw new Error('CryptoCompare response error: ' + response.status);
  const responseJSON = await response.json();
  if (responseJSON.Response === 'Error')
    throw new Error(
      `CryptoCompare API error for ${denomSymbol}/${quoteSymbol} at ${timestamp}: ${responseJSON.Message}`
    );
  if (responseJSON[denomSymbol] && responseJSON[denomSymbol][quoteSymbol]) {
    const rate = BigNumber(responseJSON[denomSymbol][quoteSymbol]);
    if (isPosBN(rate)) return rate;
    throw new Error(
      `CryptoCompare bad rate for ${denomSymbol}/${quoteSymbol} at ${timestamp}: ${responseJSON[denomSymbol][quoteSymbol]}`
    );
  }
  throw new Error(
    `CryptoCompare historical rate not found for ${denomSymbol}/${quoteSymbol} at ${timestamp}`
  );
};

export const cryptoCompare = new RatesApi({
  currentFetcher: fetchCurrentRate,
  historicalFetcher: fetchHistoricalRate,
  rateLimitTimeout: 2,
  retries: 3
});
