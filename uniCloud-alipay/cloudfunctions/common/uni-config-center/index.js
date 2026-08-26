'use strict';

const path = require('path');
const fs = require('fs');

module.exports = function (options) {
  const opts = options || {};
  const pluginId = opts.pluginId;
  if (!pluginId) throw new Error('[uni-config-center] pluginId is required');

  const configDir = path.resolve(__dirname, pluginId);
  const configJsonPath = path.join(configDir, 'config.json');
  const configJsPath = path.join(configDir, 'config.js');

  let config = {};

  if (fs.existsSync(configJsPath)) {
    try {
      config = require(configJsPath) || {};
    } catch (e) {
      console.error('[uni-config-center] load config.js error:', e.message);
    }
  }

  if (fs.existsSync(configJsonPath)) {
    try {
      const jsonConfig = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
      config = Object.assign({}, config, jsonConfig);
    } catch (e) {
      console.error('[uni-config-center] parse config.json error:', e.message);
    }
  }

  return {
    config: () => config,
    configPath: configJsonPath,
    all: () => config,
  };
};
