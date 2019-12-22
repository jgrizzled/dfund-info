// standard fund data structure

import BigNumber from 'bignumber.js';
import { returnsTimestamps } from 'utils/returnsTimestamps';

export class Fund {
  constructor(props) {
    this.name = props.name;
    this.address = props.address;
    this.denomToken = props.denomToken;
    this.inceptionTimestamp = props.inceptionTimestamp;
    this.aum = BigNumber(props.aum);
    this.sharePrice = BigNumber(props.sharePrices.current);
    this.platformName = props.platformName;
    this.platformURL = props.platformURL;

    // calculate returns from share prices
    this.retsTimes = returnsTimestamps(this.inceptionTimestamp);
    this.returns = {};
    for (const r of Object.keys(this.retsTimes)) {
      this.returns[r] = calcReturn(
        props.sharePrices.current,
        props.sharePrices[r]
      );
    }
  }
}

// calculate return from prices
const calcReturn = (currentPrice, previousPrice) => {
  if (
    currentPrice === undefined ||
    previousPrice === undefined ||
    BigNumber(previousPrice).eq(0)
  )
    return undefined;
  return BigNumber(currentPrice)
    .div(previousPrice)
    .minus(1);
};
