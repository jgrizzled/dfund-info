// number formatting functions

import BigNumber from 'bignumber.js';

// format numbers to have up to 2 decimal places unless there are leading zeroes
export function formatNumber(number) {
  if (number === undefined) return '--';
  const price = BigNumber(number);
  if (price.comparedTo(10 ** -8) === -1) return '0';
  // truncate extra decimal places
  const [int, dec] = price
    .toFixed()
    .toString()
    .split('.');
  if (dec !== undefined) {
    const firstNonZero = dec.split('').findIndex(x => x !== '0');
    if (int !== '0') {
      if (firstNonZero > 1) return numberWithCommas(int);
      return numberWithCommas(
        int + '.' + dec.substring(0, firstNonZero + 2).substring(0, 2)
      );
    }
    return numberWithCommas(int + '.' + dec.substring(0, firstNonZero + 2));
  }
  return numberWithCommas(int);
}

// format number to percentage (*100%) with two decimal places
export function formatPercentage(percentage) {
  if (percentage === undefined) return '--';
  return numberWithCommas((percentage * 100).toFixed(2)) + '%';
}

// insert commas
function numberWithCommas(n) {
  const parts = n.toString().split('.');
  return (
    parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (parts[1] ? '.' + parts[1] : '')
  );
}
