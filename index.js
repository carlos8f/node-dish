var Dish = require('./lib/dish')
  , fs = require('fs')

// create a dish from string or buffer
module.exports = function (data, headers, options) {
  var dish = new Dish(data, headers, options);
  return function (req, res, status) {
    dish.serve(req, res, status);
  };
};

// create a dish from a file path
module.exports.file = require('./lib/file');
