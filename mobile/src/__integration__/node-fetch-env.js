// Jest environment for the backend contract test only: the Expo preset
// replaces global fetch with a stubbed `expo/fetch`, so keep Node's real
// networking primitives available for the test to restore.
const ReactNativeEnv = require("@react-native/jest-preset/jest/react-native-env.js");

module.exports = class NodeFetchEnv extends ReactNativeEnv {
  constructor(config, context) {
    super(config, context);
    this.global.__nodeNet = { fetch, Headers, Request, Response, FormData, AbortController, AbortSignal };
  }
};
