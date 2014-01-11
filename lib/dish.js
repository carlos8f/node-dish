var gzippable = require('./gzippable')
  , copy = require('./copy')
  , crypto = require('crypto')
  , zlib = require('zlib')

function sha1 (str) {
  return crypto.createHash('sha1')
    .update(str)
    .digest('hex');
}

// create a dish from string or buffer
function Dish (data, options) {
  this.buf = Buffer.isBuffer(data) ? data : Buffer(data);

  this.options = copy(options);
  this.headers = copy(this.options.headers);

  var str = this.buf.toString();
  if (!this.findHeader('ETag')) {
    this.headers['ETag'] = sha1(str);
  }
  if (!this.findHeader('Content-Length')) {
    this.headers['Content-Length'] = this.buf.length;
  }

  this.mime = this.findHeader('Content-Type');
  if (this.mime) {
    this.mime = this.mime.split(';')[0].trim();
  }
  else {
    this.mime = this.options.defaultContentType || 'application/octet-stream';
    this.headers['Content-Type'] = this.mime;
  }

  this.lastModified = this.findHeader('Last-Modified');
  if (this.lastModified) {
    this.lastModified = Date.parse(this.lastModified);
  }
  else {
    var d = new Date();
    this.headers['Last-Modified'] = d.toUTCString();
    this.lastModified = d.getTime();
  }

  this.gzippable = gzippable(this.mime) && this.options.gzip !== false;
  if (this.gzippable) {
    if (this.findHeader('Vary')) {
      this.headers['Vary'] += ', Accept-Encoding';
    }
    else {
      this.headers['Vary'] = 'Accept-Encoding';
    }
  }

  if (this.options.maxAge) {
    this.headers['Cache-Control'] = 'public, max-age=' + this.options.maxAge;
  }
}

Dish.prototype.findHeader = function (header) {
  var ret, self = this;
  header = header.toLowerCase();
  Object.keys(this.headers).forEach(function (k) {
    if (k.toLowerCase() === header) {
      ret = self.headers[k];
    }
  });
  return ret;
};

Dish.prototype.gzip = function (cb) {
  var self = this;
  if (this.gzippable && !this.gzipped) {
    zlib.gzip(this.buf, function (err, data) {
      if (err) {
        throw err;
        return;
      }
      self.gzipped = data;
      self.gzippedLength = data.length;
      cb();
    });
  }
  else {
    cb();
  }
};

Dish.prototype.serve = function (req, res, status) {
  var self = this;
  // in case a next() function was passed instead of status
  if (typeof status === 'function') {
    status = 200;
  }
  this.gzip(function () {
    var headers = copy(self.headers), body = self.buf;

    if (self.gzipped && req.headers['accept-encoding'] && /gzip/i.exec(req.headers['accept-encoding'])) {
      body = self.gzipped;
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = self.gzippedLength;
    }
    if (req.headers['if-none-match'] === headers['ETag'] || Date.parse(req.headers['if-modified-since']) >= self.lastModified) {
      status = 304;
      body = null;
    }
    if (req.method === 'HEAD') {
      body = null;
    }
    if (!body) {
      delete headers['Content-Encoding'];
      delete headers['Content-Length'];
    }

    res.writeHead(status || 200, headers);
    res.end(body);
  });
};

module.exports = Dish;
