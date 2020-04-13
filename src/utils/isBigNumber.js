// BigNumber.js checking functions

import BigNumber from 'bignumber.js';

export const isBN = bn =>
  bn instanceof BigNumber && !bn.isNaN() && bn.isFinite();

export const isPosBN = bn => isBN(bn) && bn.gt(0);
