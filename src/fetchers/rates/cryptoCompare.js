// Crypto exchange rate fetchers for CryptoCompare
// use RatesAPI instance

import BigNumber from 'bignumber.js';
import { RatesApi } from './RatesApi';

// fetch current exchange rate of a pair
const fetchCurrentRate = async (denomSymbol, quoteSymbol, key) => {
  console.log(
    `Fetching current rate for ${denomSymbol}/${quoteSymbol} from CryptoCompare`
  );
  const response = await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${denomSymbol}&tsyms=${quoteSymbol}&api_key=${key}`
  );
  if (!response.ok) throw new Error('CryptoCompare response error');
  const responseJSON = await response.json();
  if (responseJSON.Response === 'Error')
    throw new Error('CryptoCompare API error: ' + responseJSON.Message);
  if (responseJSON.hasOwnProperty(quoteSymbol)) {
    const rate = BigNumber(responseJSON[quoteSymbol]);
    if (rate.gt(0)) return rate;
    throw new Error(
      'CryptoCompare unexpected rate data: ' + responseJSON[quoteSymbol]
    );
  }
  throw new Error('CryptoCompare rate not found');
};

// fetch historical rate at a timestamp of a pair
const fetchHistoricalRate = async (
  denomSymbol,
  quoteSymbol,
  timestamp,
  key
) => {
  console.log(
    `Fetching historical rate for ${denomSymbol}/${quoteSymbol} at ${timestamp} from CryptoCompare`
  );
  const response = await fetch(
    `https://min-api.cryptocompare.com/data/pricehistorical?fsym=${denomSymbol}&tsyms=${quoteSymbol}&ts=${timestamp}&api_key=${key}`
  );
  if (!response.ok) throw new Error('CryptoCompare response error');
  const responseJSON = await response.json();
  if (responseJSON.Response === 'Error')
    throw new Error('CryptoCompare API error: ' + responseJSON.Message);
  if (
    responseJSON.hasOwnProperty(denomSymbol) &&
    responseJSON[denomSymbol].hasOwnProperty(quoteSymbol)
  ) {
    const rate = BigNumber(responseJSON[denomSymbol][quoteSymbol]);
    if (rate.gt(0)) return rate;
    throw new Error(
      'CryptoCompare bad rate ',
      responseJSON[denomSymbol][quoteSymbol]
    );
  }
  throw new Error('CryptoCompare rate not found');
};

export const cryptoCompare = new RatesApi({
  currentFetcher: fetchCurrentRate,
  historicalFetcher: fetchHistoricalRate,
  rateLimitTimeout: 60,
  key: 'c835fca94db2e16d30145d28ffa72bae66985cfcaff0fec8837e4b4f82b51749'
  //local test key
  //key: '2c197a1c1cb6ed841efb6366509fe4c679e96ba6fa258446c11a567ee7c2ad70'
});
