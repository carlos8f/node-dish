assert = require('assert');
util = require('util');
http = require('http');
path = require('path');
fs = require('fs');
dish = require('../');

listen = function (fn) {
  var server = http.createServer();
  server.listen(0, function () {
    fn(server, server.address().port);
  });
};

request = require('superagent');