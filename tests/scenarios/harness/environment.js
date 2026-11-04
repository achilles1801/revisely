// The test environment of the scenarios: React Native's, plus a way to set the
// phone's time zone. Jest gives each test file its own copy of process.env, so
// TZ set there never reaches Node; this sets the real one, which Node applies at
// once to Date and Intl.
const path = require('path');
const preset = require('jest-expo/jest-preset');
const Base = require(preset.testEnvironment);
const BaseEnvironment = Base.default ?? Base;

class ScenarioEnvironment extends BaseEnvironment {
  constructor(config, context) {
    super(config, context);
    const original = process.env.TZ;
    this.global.__setTimeZone = (zone) => {
      if (zone === undefined) {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      } else {
        process.env.TZ = zone;
      }
    };
  }
}

module.exports = ScenarioEnvironment;
