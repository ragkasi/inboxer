const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: {
    popup: './src/popup/index.jsx',
    background: './src/background.js',
    content: './src/content.js'
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].[chunkhash].js',
    clean: true
  },
  optimization: {
    usedExports: true,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true
          },
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ],
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 40
        },
        redux: {
          test: /[\\/]node_modules[\\/](@reduxjs|redux|react-redux)[\\/]/,
          name: 'redux',
          chunks: 'all',
          priority: 30
        },
        defaultVendors: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10,
          reuseExistingChunk: true,
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    fallback: {
      "buffer": false,
      "crypto": false,
      "stream": false,
      "util": false,
      "path": false,
      "url": false,
      "https": false,
      "http": false,
      "fs": false,
      "net": false,
      "tls": false,
      "child_process": false,
      "http2": false,
      "os": false,
      "querystring": false,
      "zlib": false,
      "assert": false,
      "process": false,
      "vm": false,
      "events": false
    }
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { modules: false }],
              ['@babel/preset-react', { runtime: 'automatic' }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/popup.html'),
      filename: 'popup.html',
      chunks: ['popup', 'react', 'redux']
    }),
    new CopyPlugin({
      patterns: [
        { 
          from: path.resolve(__dirname, 'src/manifest.json'),
          to: 'manifest.json'
        },
        {
          from: path.resolve(__dirname, 'src/icons'),
          to: 'icons'
        }
      ]
    }),
    new Dotenv()
  ]
};