const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow @xenova/transformers to work in React Native
config.resolver.assetExts.push("onnx");
config.resolver.sourceExts.push("mjs");

module.exports = config;
