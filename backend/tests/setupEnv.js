// tests/setupEnv.js
// Jest runs this before each test file's own code, so env.js sees
// the test database and test secrets instead of real ones.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });
