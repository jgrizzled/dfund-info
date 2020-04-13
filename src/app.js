// dFund Info main app logic

'use strict';
import $ from 'jquery';
import BigNumber from 'bignumber.js';
import * as moment from 'moment';
import { formatNumber, formatPercentage } from 'utils/formatNumber';
import { settlePromises } from 'utils/settlePromises';
import { returnsTimestamps } from 'utils/returnsTimestamps';
import 'styles/styles.scss';
import config from 'config';
const { mockAPIs } = config;
// Real data API hookups
import { fundFetcher as ff } from 'fetchers/FundFetcher';
import { priceFetcher as pf } from 'fetchers/PriceFetcher';
// Mock API hookups
import { fundFetcher as mock_ff } from 'fetchers/test/fundFetcher-test';
import { priceFetcher as mock_pf } from 'fetchers/test/priceFetcher-test';
let fundFetcher, priceFetcher;
if (mockAPIs) {
  fundFetcher = mock_ff;
  priceFetcher = mock_pf;
} else {
  fundFetcher = ff;
  priceFetcher = pf;
}
import { isBN, isPosBN } from 'utils/isBigNumber';
import logger from 'logger';

const quoteChars = {
  USD: '$',
  BTC: 'Ƀ',
  ETH: 'Ξ'
};

class App {
  constructor(props) {
    this.sortProp = props.sortProp;
    this.isAscending = props.isAscending;
    this.perPage = props.perPage;

    this.page = 1;

    // raw fund data
    this.funds = [];
    // converted prices/returns
    this.quotedFunds = [];
    this.filteredFunds = [];
    this.fixedTableHeaderVisible = false;

    // elements
    this.$settingsForm = $('#settings-form');
    this.$settingsForm.on('submit', e => {
      e.preventDefault();
    });
    this.$searchBox = this.$settingsForm.find('#fund-name');
    this.$minAssets = this.$settingsForm.find('#min-aum');
    this.$maxAssets = this.$settingsForm.find('#max-aum');
    this.$melonCheck = this.$settingsForm.find('#melon-check');
    this.$tokensetsCheck = this.$settingsForm.find('#tokensets-check');
    this.$betokenCheck = this.$settingsForm.find('#betoken-check');
    this.$pages = $('#pages');
    this.$tbody = $('#tbody-funds');
    this.$currencySelector = $('#currency-selector');
    this.quoteSymbol = this.$currencySelector
      .find('input[name=denomination]:checked')
      .val();
    this.$mainTable = $('#main-table');
    this.$fixedTableHeader = $('#fixed-table-header');
    this.$bothHeaders = $('.table-container thead');
    this.$appMessage = $('#app-message');
    this.$window = $(window);

    // binders
    this._handleRadioClick = this._handleRadioClick.bind(this);
    this._handleWindowScroll = this._handleWindowScroll.bind(this);
    this._handleTableScroll = this._handleTableScroll.bind(this);
    this._handleFixedTableHeaderScroll = this._handleFixedTableHeaderScroll.bind(
      this
    );
    this._handleHeaderClick = this._handleHeaderClick.bind(this);
    this.addFund = this.addFund.bind(this);
    this._handleFilterForm = this._handleFilterForm.bind(this);
    this._enableCurrencySelector = this._enableCurrencySelector.bind(this);
    this._disableCurrencySelector = this._disableCurrencySelector.bind(this);
    this._handlePageClick = this._handlePageClick.bind(this);
  }
  async init() {
    // try prefetching common price data
    priceFetcher
      .fetchTimeSeries('ETH', 'USD')
      .then(() => {
        logger.log('Got ETH/USD timeseries');
      })
      .catch(e => {
        logger.log(e);
      });
    priceFetcher
      .fetchTimeSeries('BTC', 'USD')
      .then(() => {
        logger.log('Got BTC/USD timeseries');
      })
      .catch(e => {
        logger.log(e);
      });
    // start fund fetch jobs
    try {
      await fundFetcher.fetchFunds(this.addFund);
    } catch (e) {
      logger.log(e);
      this.$appMessage.text('Error: failed to load funds');
      return;
    }
    this.sortFunds();
    this.renderFunds();
    this._attachEventHandlers();
    this._enableCurrencySelector();
  }
  // callback function for APIs to add funds to table
  async addFund(fund) {
    this.funds.push(fund);
    try {
      const quotedFunds = await this.calcFundQuotes([fund]);
      this.quotedFunds.push(...quotedFunds);
    } catch (e) {
      logger.error('Error quoting fund', e, fund);
    }
  }
  // calculate prices/returns in terms of quote symbol
  async calcFundQuotes(funds) {
    // initialize jobs object
    const ratesJobs = {};
    // build price lookup jobs
    funds.forEach(fund => {
      const retsTimes = returnsTimestamps(fund.inceptionTimestamp);
      ratesJobs[fund.address] = {};
      ratesJobs[fund.address].currentRate = priceFetcher.fetchRate(
        fund.denomToken.symbol,
        this.quoteSymbol
      );
      for (const k in retsTimes) {
        if (retsTimes[k] >= fund.inceptionTimestamp)
          ratesJobs[fund.address][k] = priceFetcher.fetchRate(
            fund.denomToken.symbol,
            this.quoteSymbol,
            retsTimes[k]
          );
      }
    });
    // await price lookups
    // calculate price quotes/conversions
    const quotedFunds = [];
    await Promise.all(
      funds.map(async fund => {
        const ratesResults = {};
        for (const k in ratesJobs[fund.address]) {
          try {
            ratesResults[k] = await ratesJobs[fund.address][k];
          } catch (e) {
            logger.error(
              `Cannot quote fund ${fund.name} ${fund.address} from ${fund.platformName} for ${k}: ${e.message}`
            );
            return;
          }
        }
        if (isPosBN(ratesResults.currentRate)) {
          // calc returns conversions
          const convertedReturns = {};
          for (const k in ratesResults) {
            if (k === 'currentRate') continue;
            if (isPosBN(ratesResults[k])) {
              if (isBN(fund.returns[k])) {
                // sanity check: ignore returns greater than 100,000% or less than -100,000%
                if (fund.returns[k].lte(1000) && fund.returns[k].gte(-1000)) {
                  // currentRate / pastRate - 1
                  const quoteSymbolReturn = ratesResults.currentRate
                    .div(ratesResults[k])
                    .minus(1);
                  // (fundReturns + 1) * (quoteSymbolReturns + 1) - 1
                  convertedReturns[k] = fund.returns[k]
                    .plus(1)
                    .times(quoteSymbolReturn.plus(1))
                    .minus(1);
                } else
                  logger.warn(
                    `Invalid return for fund ${fund.name} ${fund.address} from ${fund.platformName}: ${fund.returns[k]}`
                  );
              }
            } else
              logger.error(
                `Got invalid historical rate for fund ${fund.name} ${fund.address} from ${fund.platformName}: (${fund.denomToken.symbol}/${this.quoteSymbol}): ${ratesResults[k]}`
              );
          }
          // copy converted fund data

          const convert = x => {
            if (isPosBN(x)) return x.times(ratesResults.currentRate);
            return null;
          };

          quotedFunds.push({
            name: fund.name,
            address: fund.address,
            denomSymbol: fund.denomToken.symbol,
            inceptionTimestamp: fund.inceptionTimestamp,
            aum: convert(fund.aum),
            sharePrice: convert(fund.sharePrice),
            returns: convertedReturns,
            platformName: fund.platformName,
            platformURL: fund.platformURL
          });
        } else
          logger.error(
            `Got invalid current rate for fund ${fund.name} (${fund.denomToken.symbol}/${this.quoteSymbol}): ${ratesResults.currentRate}`
          );
      })
    );
    if (quotedFunds.length === 0) logger.warn('No quoted funds');
    return quotedFunds;
  }
  renderFunds() {
    // filter funds to display
    this.filterFunds();
    // calculate start/end of page
    const fundStart = (this.page - 1) * this.perPage;
    const fundEnd = fundStart + this.perPage;
    const start = Math.min(Math.max(fundStart, 1), this.filteredFunds.length);
    const end = Math.min(fundStart + this.perPage, this.filteredFunds.length);
    // sum value of funds
    const totalValue = this.filteredFunds.reduce(
      (acc, i) => (isPosBN(i.aum) ? acc.plus(i.aum) : acc),
      BigNumber(0)
    );
    // render table info header
    this.$appMessage.html(
      `Market Cap: ${quoteChars[this.quoteSymbol]} ${formatNumber(
        totalValue
      )} <br>
      Showing ${start} - ${end} of ${this.filteredFunds.length} funds
      `
    );
    this.$tbody.empty();
    const displayFunds = this.filteredFunds.slice(fundStart, fundEnd);
    this.$tbody.html(this._fundRowsHtml(displayFunds));
    this.$pages.empty();
    const pages = Math.ceil(this.filteredFunds.length / this.perPage);
    // render page number links
    if (pages > 1) {
      for (let i = 1; i <= pages; i++) {
        let pageLink = `
      <a href="#app-message">${i}</a>
      `;
        if (this.page == i) pageLink = `<b>${i}</b>`;
        this.$pages.append(`
      <li>${pageLink}</li>
      `);
      }
    }
  }
  // filter funds based on form criteria
  filterFunds() {
    this.filteredFunds = this.quotedFunds.filter(
      fund =>
        (this.$searchBox.val() === '' ||
          fund.name
            .toLowerCase()
            .includes(this.$searchBox.val().toLowerCase())) &&
        (this.$minAssets.val() === '' ||
          (isPosBN(fund.aum) && fund.aum.gte(this.$minAssets.val()))) &&
        (this.$maxAssets.val() === '' ||
          (isPosBN(fund.aum) && fund.aum.lte(this.$maxAssets.val()))) &&
        ((this.$melonCheck.is(':checked') && fund.platformName === 'Melon') ||
          (this.$tokensetsCheck.is(':checked') &&
            fund.platformName === 'TokenSets') ||
          (this.$betokenCheck.is(':checked') &&
            fund.platformName === 'Betoken'))
    );
  }
  sortFunds() {
    fundFetcher.sortFunds(this.quotedFunds, this.sortProp, this.isAscending);
  }
  // page number link handler
  _handlePageClick(event) {
    if (event.target.text !== undefined && event.target.text != this.page) {
      this.page = event.target.text;
      this.renderFunds();
    }
  }
  // reset page number and re-filter/render funds on form edits
  _handleFilterForm() {
    this.page = 1;
    this.renderFunds();
  }
  // trigger fund quote recalculation
  async _handleRadioClick(event) {
    // dont let user change currency while still calculating
    this._disableCurrencySelector();
    if (this.quoteSymbol !== event.target.value) {
      this.$appMessage.text('Loading prices...');
      const oldQuoteSymbol = this.quoteSymbol;
      this.quoteSymbol = event.target.value;
      try {
        this.quotedFunds = await this.calcFundQuotes(this.funds);
        // convert numbers in min/max asset fields
        if (this.$minAssets.val() !== '') {
          const rate = await priceFetcher.fetchRate(
            oldQuoteSymbol,
            this.quoteSymbol
          );
          this.$minAssets.val(rate.times(this.$minAssets.val()).toFixed(2));
        }
        if (this.$maxAssets.val() !== '') {
          const rate = await priceFetcher.fetchRate(
            oldQuoteSymbol,
            this.quoteSymbol
          );
          this.$maxAssets.val(rate.times(this.$maxAssets.val()).toFixed(2));
        }
        this.sortFunds();
        this.renderFunds();
      } catch (e) {
        this.$appMessage.text('Error: ' + e);
      }
    }
    this.$currencySelector.one('click', '.price-radio', this._handleRadioClick);
    this._enableCurrencySelector();
  }
  _disableCurrencySelector() {
    this.$currencySelector.find('input').prop('disabled', true);
  }
  _enableCurrencySelector() {
    this.$currencySelector.find('input').prop('disabled', false);
  }
  // table sort handler
  _handleHeaderClick(event) {
    event.stopPropagation();
    const $targetHeader = $(event.target);
    const className = event.target.className;
    // selector for clicked <th> in table and clone table
    const classes = className.split(' ');
    const $columnHeaders = $(`.${classes[0]}.sortable`);
    const sortProp = $targetHeader.data('sort');
    if (sortProp !== this.sortProp) {
      $('.sortable').removeClass('sorted-desc');
      $('.sortable').removeClass('sorted-asc');
      this.sortProp = sortProp;
      this.isAscending = false;
      $columnHeaders.addClass('sorted-desc');
    } else {
      if (this.isAscending) {
        this.isAscending = false;
        $columnHeaders.removeClass('sorted-asc');
        $columnHeaders.addClass('sorted-desc');
      } else {
        this.isAscending = true;
        $columnHeaders.removeClass('sorted-desc');
        $columnHeaders.addClass('sorted-asc');
      }
    }
    this.sortFunds();
    this.renderFunds();
  }
  _handleWindowScroll() {
    const tableTop = this.$mainTable.offset().top;
    if (this.$window.scrollTop() < tableTop) {
      if (this.fixedTableHeaderVisible) {
        this.$fixedTableHeader.off('scroll');
        this.$mainTable.off('scroll');
        this.$fixedTableHeader.addClass('hidden');
        this.fixedTableHeaderVisible = false;
      }
    } else {
      if (!this.fixedTableHeaderVisible) {
        this.$fixedTableHeader.removeClass('hidden');
        this.$fixedTableHeader.scrollLeft(this.$mainTable.scrollLeft());
        this.$fixedTableHeader.on('scroll', this._handleFixedTableHeaderScroll);
        this.$mainTable.on('scroll', this._handleTableScroll);
        this.fixedTableHeaderVisible = true;
      }
    }
  }
  _handleTableScroll() {
    this.$fixedTableHeader.scrollLeft(this.$mainTable.scrollLeft());
    this.$mainTable.one('scroll', this._handleTableScroll);
  }
  _handleFixedTableHeaderScroll() {
    this.$mainTable.scrollLeft(this.$fixedTableHeader.scrollLeft());
    this.$fixedTableHeader.one('scroll', this._handleFixedTableHeaderScroll);
  }
  _attachEventHandlers() {
    this.$currencySelector.one('click', '.price-radio', this._handleRadioClick);
    this.$window.on('scroll', this._handleWindowScroll);
    this.$bothHeaders.on('click', '.sortable', this._handleHeaderClick);
    this.$settingsForm.on('keyup', this._handleFilterForm);
    this.$settingsForm.on('click', this._handleFilterForm);
    this.$pages.on('click', this._handlePageClick);
  }
  _fundRowsHtml(funds) {
    let html = '';
    funds.forEach(fund => {
      html += `
        <tr>
          <td class="col-rank">
            ${
              this.filteredFunds.findIndex(
                _fund => _fund.address === fund.address
              ) + 1
            }
          </td>
          <td class="col-name">
            <a href="https://etherscan.io/address/${
              fund.address
            }" target="_blank">${escapeHTML(fund.name)}</a>
          </td>
          <td class="col-aum">
            ${
              formatNumber(fund.aum) !== '--'
                ? quoteChars[this.quoteSymbol]
                : ''
            }
            ${formatNumber(fund.aum)}
          </td>
          <td class="col-sp">
            ${
              formatNumber(fund.sharePrice) !== '--'
                ? quoteChars[this.quoteSymbol]
                : ''
            }
            ${formatNumber(fund.sharePrice)}
          </td>
          <td class="col-1d">
            ${this._fundReturnsHTML(fund.returns.lastDay)}
          </td>
          <td class="col-1w">
            ${this._fundReturnsHTML(fund.returns.lastWeek)}
          </td>
          <td class="col-1m">
            ${this._fundReturnsHTML(fund.returns.lastMonth)}
          </td>
          <td class="col-3m">
            ${this._fundReturnsHTML(fund.returns.last3Months)}
          </td>
          <td class="col-ytd">
            ${this._fundReturnsHTML(fund.returns.yearStart)}
          </td>
          <td class="col-1y">
            ${this._fundReturnsHTML(fund.returns.lastYear)}
          </td>
          <td class="col-si">
            ${this._fundReturnsHTML(fund.returns.inception)}
          </td>
          <td class="col-inception-date">
            ${moment.unix(fund.inceptionTimestamp).format('YYYY-MM-DD')}
          </td>
          <td class="col-platform">
            <a href="${fund.platformURL}" target="_blank">${
        fund.platformName
      }</a>
          </td>
        </tr>
      `;
    });
    return html;
  }
  _fundReturnsHTML(returns) {
    let className = 'no-num';
    if (isBN(returns)) {
      if (returns.gt(0)) className = 'positive-num';
      else if (returns.lt(0)) className = 'negative-num';
      else className = 'zero-num';
    }
    return `<span class="${className}">${formatPercentage(returns)}</span>`;
  }
}

// Convert unsafe strings for display in HTML
const escapeHTML = string => $('<div/>').text(string).html();

// on document load
$(async () => {
  const app = new App({
    sortProp: 'aum',
    isAscending: false,
    perPage: 100
  });
  await app.init();
});
