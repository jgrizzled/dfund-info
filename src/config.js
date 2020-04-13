// App configuration

// Set environment
const env = 'production';

const production = {
  cryptoCompareAPIkey:
    'c835fca94db2e16d30145d28ffa72bae66985cfcaff0fec8837e4b4f82b51749',
  alphaVantageAPIkey: 'JQ5UWR09CPSA50BB',
  web3Provider: 'https://mainnet.infura.io/v3/b89c21c5a5d149d7b38562a7f28f201e',
  mockAPIs: false,
  logLevel: 'error'
};

const development = {
  cryptoCompareAPIkey:
    '2c197a1c1cb6ed841efb6366509fe4c679e96ba6fa258446c11a567ee7c2ad70',
  alphaVantageAPIkey: 'JQ5UWR09CPSA50BB',
  web3Provider: 'http://192.168.1.22:8545',
  mockAPIs: false,
  logLevel: 'warn'
};

const test = {
  cryptoCompareAPIkey: null,
  alphaVantageAPIkey: null,
  web3Provider: null,
  mockAPIs: true,
  logLevel: 'log'
};

let config;
if (env === 'production') config = production;
else if (env === 'development') config = development;
else config = test;

export default config;
