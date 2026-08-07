const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'none',
  target: 'node',
  entry: {
    extension: './src/extension.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  plugins: [
    // The tracer scripts are spawned as separate processes at runtime (not
    // bundled by webpack), so they must be copied alongside extension.js —
    // dist/ is the single source of truth for what ships in the package.
    new CopyPlugin({
      patterns: [
        { from: 'src/adapters/javascript/tracer.js', to: 'adapters/javascript/tracer.js' },
        { from: 'src/adapters/python/tracer.py', to: 'adapters/python/tracer.py' }
      ]
    })
  ]
};
