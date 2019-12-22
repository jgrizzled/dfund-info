const merge = require('webpack-merge');
const common = require('./webpack.common.js');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin;
const path = require('path');

module.exports = merge(common, {
  mode: 'production',
  plugins: [new BundleAnalyzerPlugin()]
});
