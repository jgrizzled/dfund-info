// provides object with timestamps of dates from which to calculate fund returns

import * as moment from 'moment';
export const returnsTimestamps = inceptionTimestamp => ({
  lastDay: moment()
    .subtract(1, 'days')
    .unix(),
  lastWeek: moment()
    .subtract(7, 'days')
    .unix(),
  lastMonth: moment()
    .subtract(30, 'days')
    .unix(),
  last3Months: moment()
    .subtract(90, 'days')
    .unix(),
  yearStart: moment()
    .startOf('year')
    .unix(),
  lastYear: moment()
    .subtract(365, 'days')
    .unix(),
  inception: Number(inceptionTimestamp)
});
