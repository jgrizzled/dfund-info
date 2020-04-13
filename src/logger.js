// logger
import config from 'config';
const { logLevel } = config;

const log = msg => logLevel === 'log' && console.log(msg);

const warn = msg =>
  (logLevel === 'warn' || logLevel === 'log') && console.warn(msg);

const error = msg =>
  (logLevel === 'error' || logLevel === 'warn' || logLevel === 'log') &&
  console.error(msg);

export default { log, warn, error };
