const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

// Process manifest.json template with environment variables
const processManifest = () => {
  const manifestPath = path.resolve(__dirname, 'src/manifest.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  // Replace environment variables in the manifest
  const processedContent = manifestContent.replace(
    /\${(\w+)}/g, 
    (match, variable) => {
      return process.env[variable] || match;
    }
  );
  
  return JSON.parse(processedContent);
};

// Common configuration for all entries
const commonConfig = {
  mode: 'production',
  devtool: 'source-map',
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
  optimization: {
    usedExports: true,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false,  // IMPORTANT: Don't remove console logs
            drop_debugger: true
          },
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  },
  performance: {
    hints: 'warning',
    maxAssetSize: 500000,       // 500 KiB
    maxEntrypointSize: 500000,  // 500 KiB
    assetFilter: function(assetFilename) {
      // Only show hints for JavaScript files
      return assetFilename.endsWith('.js');
    }
  }
};

// Background configuration (ES module)
const backgroundConfig = {
  ...commonConfig,
  target: 'webworker',
  experiments: {
    outputModule: true
  },
  entry: {
    background: './src/background.js'
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js',
    module: true,
    library: {
      type: 'module'
    }
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: '// Force logging to appear in service worker\nself.WEBPACK_IMPORTED_MODULE = true;\nconsole.log("🚀 Service worker bundle loaded at", new Date().toISOString());',
      raw: true,
      entryOnly: true,
      test: /background\.js$/
    }),
    new Dotenv(),
    new webpack.DefinePlugin({
      'process.env.REACT_APP_GMAIL_CLIENT_ID': JSON.stringify(process.env.REACT_APP_GMAIL_CLIENT_ID),
      'process.env.REACT_APP_OUTLOOK_CLIENT_ID': JSON.stringify(process.env.REACT_APP_OUTLOOK_CLIENT_ID)
    })
  ]
};

// Popup validator configuration
const popupValidatorConfig = {
  ...commonConfig,
  target: 'web',
  entry: {
    'popup-validator': './src/popup-validator.js'
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js'
  },
  plugins: [
    new Dotenv(),
    new webpack.DefinePlugin({
      'process.env.REACT_APP_GMAIL_CLIENT_ID': JSON.stringify(process.env.REACT_APP_GMAIL_CLIENT_ID),
      'process.env.REACT_APP_OUTLOOK_CLIENT_ID': JSON.stringify(process.env.REACT_APP_OUTLOOK_CLIENT_ID)
    })
  ]
};

// Popup and content scripts configuration (regular JS)
const uiConfig = {
  ...commonConfig,
  target: 'web',
  entry: {
    popup: './src/popup/index.jsx',
    content: './src/content.js'
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js',
    chunkFilename: '[name].[chunkhash].js',
    clean: true // Clean the dist folder on each build
  },
  optimization: {
    ...commonConfig.optimization,
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
          test: /[\\/]node_modules[\\/](?:@reduxjs|redux|react-redux)[\\/]/,
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
      }
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/popup.html'),
      filename: 'popup.html',
      chunks: ['popup', 'react', 'redux'],
      inject: 'head'
    }),
    new CopyPlugin({
      patterns: [
        { 
          from: path.resolve(__dirname, 'src/manifest.json'),
          to: 'manifest.json',
          transform(content) {
            // Replace environment variables in the manifest.json
            return Buffer.from(
              content.toString().replace(
                /\${(\w+)}/g, 
                (match, variable) => {
                  return process.env[variable] || match;
                }
              )
            );
          },
        },
        {
          from: path.resolve(__dirname, 'src/icons'),
          to: 'icons'
        },
        {
          from: path.resolve(__dirname, 'src/graph-shim.js'),
          to: 'graph-shim.js'
        }
      ]
    }),
    new Dotenv(),
    new webpack.DefinePlugin({
      'process.env.REACT_APP_GMAIL_CLIENT_ID': JSON.stringify(process.env.REACT_APP_GMAIL_CLIENT_ID),
      'process.env.REACT_APP_OUTLOOK_CLIENT_ID': JSON.stringify(process.env.REACT_APP_OUTLOOK_CLIENT_ID)
    })
  ]
};

// Export an array of configurations
module.exports = [backgroundConfig, popupValidatorConfig, uiConfig];