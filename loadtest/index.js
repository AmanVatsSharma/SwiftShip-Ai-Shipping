// Public re-export point for the loadtest project. The k6 scenarios
// themselves are imported by the k6 binary via the file path passed to
// `k6 run`, not via Node's module system — this barrel exists so
// `nx graph` and the depConstraints have a node to attach to.
'use strict';

module.exports = {};
