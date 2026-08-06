// scripts/migrate-test.js
// Loads .env.test BEFORE anything else, then runs the same
// migrate.js used for the real database, so pulseops_test gets the
// exact same schema as dev/production.

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });
require('./migrate.js');
