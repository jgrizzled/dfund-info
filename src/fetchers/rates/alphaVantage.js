// Crypto exchange rate fetchers for AlphaVantage.co
// use RatesAPI instance

import BigNumber from 'bignumber.js';
import { RatesApi } from './RatesApi';
import * as moment from 'moment';

// Fetch latest exchange rate for a pair
const fetchCurrentRate = async (denomSymbol, quoteSymbol, key) => {
  console.log(
    `Fetching current rate for ${denomSymbol}/${quoteSymbol} from AlphaVantage`
  );
  const response = await fetch(
    `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${denomSymbol}&to_currency=${quoteSymbol}&apikey=${key}`
  );
  if (!response.ok) throw new Error('AlphaVantage response error');
  const responseJSON = await response.json();
  if (responseJSON.hasOwnProperty('Error Message'))
    throw new Error('AlphaVantage API error: ' + responseJSON['Error Message']);
  if (
    responseJSON.hasOwnProperty('Realtime Currency Exchange Rate') &&
    responseJSON['Realtime Currency Exchange Rate'].hasOwnProperty(
      '5. Exchange Rate'
    )
  ) {
    const rateData = BigNumber(
      responseJSON['Realtime Currency Exchange Rate']['5. Exchange Rate']
    );
    if (rateData.gt(0)) return rateData;
    throw new Error(
      'AlphaVantage unexpected rate data: ' +
        responseJSON['Realtime Currency Exchange Rate']['5. Exchange Rate']
    );
  }
  if (
    responseJSON.hasOwnProperty('Note') &&
    responseJSON.Note.includes('call frequency')
  )
    throw new Error('AlphaVantage API rate limit hit');
  throw new Error('AlphaVantage rate not found: ' + responseJSON);
};

// Fetch an exchange rate timeseries for a pair, going back a few years
const fetchTimeSeries = async (denomSymbol, quoteSymbol, timestamp, key) => {
  console.log(
    `Fetching time series for ${denomSymbol}/${quoteSymbol} from AlphaVantage`
  );
  var response = await fetch(
    `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${denomSymbol}&market=${quoteSymbol}&apikey=${key}`
  );
  if (!response.ok) throw new Error('AlphaVantage response error');
  const responseJSON = await response.json();
  if (responseJSON.hasOwnProperty('Error Message'))
    throw new Error('AlphaVantage API error: ' + responseJSON['Error Message']);
  if (!responseJSON.hasOwnProperty('Time Series (Digital Currency Daily)')) {
    if (
      responseJSON.hasOwnProperty('Note') &&
      responseJSON.Note.includes('call frequency')
    )
      throw new Error('AlphaVantage API rate limit hit');
    throw new Error('AlphaVantage rates not found ' + responseJSON);
  }
  const ratesData = [];
  for (const day of Object.keys(
    responseJSON['Time Series (Digital Currency Daily)']
  )) {
    const dayResponse =
      responseJSON['Time Series (Digital Currency Daily)'][day];
    if (dayResponse.hasOwnProperty(`4a. close (${quoteSymbol})`)) {
      const dayValue = BigNumber(dayResponse[`4a. close (${quoteSymbol})`]);
      if (dayValue.gt(0))
        ratesData.push({
          date: moment(day).format('YYYY-MM-DD'),
          rates: {
            [quoteSymbol]: {
              [denomSymbol]: dayValue
            }
          }
        });
    }
  }
  if (ratesData.length === 0) throw new Error('AlphaVantage no prices found');
  return ratesData;
};

export const alphaVantage = new RatesApi({
  currentFetcher: fetchCurrentRate,
  timeSeriesFetcher: fetchTimeSeries,
  rateLimitTimeout: 60,
  key: 'JQ5UWR09CPSA50BB'
});
