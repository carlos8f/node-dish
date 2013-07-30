var Dish = require('./dish')
  , copy = require('./copy')
  , fs = require('fs')
  , mime = require('mime')

// create a dish from a file path
module.exports = function (file, options) {
  var mimeType;
  options = copy(options);
  options.headers = copy(options.headers);

  Object.keys(options.headers).forEach(function (k) {
    if (k.toLowerCase() === 'content-type') {
      mimeType = options.headers[k].split(';')[0];
    }
  });
  // auto-detect mime type from file name
  if (!mimeType) {
    mimeType = mime.lookup(file, options.defaultContentType);
    options.headers['Content-Type'] = mimeType;
  }

  var buf = fs.readFileSync(file);
  var stat = fs.statSync(file);
  options.headers['Last-Modified'] = stat.mtime.toUTCString();
  options.headers['Content-Length'] = stat.size;

  var dish = new Dish(buf, options);
  return function (req, res, status) {
    dish.serve(req, res, status);
  };
};