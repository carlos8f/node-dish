var Dish = require('./lib/dish')
  , fs = require('fs')

// create a dish from string or buffer
module.exports = function (data, headers, options) {
  var dish = new Dish(data, headers, options);
  return dish.serve.bind(dish);
};

// create a dish from a file path
module.exports.file = require('./lib/file');