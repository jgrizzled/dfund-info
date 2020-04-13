// standard fund data structure

import BigNumber from 'bignumber.js';
import { isPosBN } from 'utils/isBigNumber';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import logger from 'logger';

export class Fund {
  constructor(props) {
    this.name = props.name;
    this.address = props.address;
    this.denomToken = props.denomToken;
    this.inceptionTimestamp = props.inceptionTimestamp;

    const aum = BigNumber(props.aum);
    if (isPosBN(aum)) this.aum = aum;
    else {
      logger.warn(
        `No AUM for ${props.name} from ${props.platformName} ${props.address}`
      );
      this.aum = null;
    }

    const sp = BigNumber(props.sharePrices.current);
    if (isPosBN(sp)) this.sharePrice = sp;
    else {
      logger.warn(
        `No share price for ${props.name} from ${props.platformName} ${props.address}`
      );
      this.sharePrice = null;
    }

    this.platformName = props.platformName;
    this.platformURL = props.platformURL;

    // calculate returns from share prices
    this.retsTimes = returnsTimestamps(this.inceptionTimestamp);
    this.returns = {};
    for (const r of Object.keys(this.retsTimes)) {
      const ret = calcReturn(props.sharePrices.current, props.sharePrices[r]);
      if (ret !== null) this.returns[r] = ret;
    }
  }
}

// calculate return from prices
const calcReturn = (currPrice, prevPrice) => {
  if (isPosBN(currPrice) && isPosBN(prevPrice))
    return currPrice.div(prevPrice).minus(1);
  return null;
};
