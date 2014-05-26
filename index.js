var crypto = require('crypto')
  , zlib = require('zlib')
  , fs = require('fs')
  , from = require('from')
  , LRU = require('lru-cache')
  , mime = require('mime')

function copy (orig) {
  var n = {};
  if (orig) {
    Object.keys(orig).forEach(function (k) {
      n[k] = orig[k];
    });
  }
  return n;
}

function gzippable (type) {
  type = type.split(';')[0];
  if (/(^text\/|(json|xml)$|^application\/(javascript$))/.exec(type)) {
    return true;
  }
}

var cache = {
  setOptions: function (options) {
    var self = this;
    this.options || (this.options = {});
    Object.keys(options).forEach(function (k) {
      self.options[k] = options[k];
    });
    cache.backend = LRU(this.options);
  }
};

cache.setOptions({
  cacheSize: 256 * 1000 * 1000, // 256 MB
  length: function (file) {
    return file.length + file.gzippedLength + file.deflatedLength;
  },
  maxAge: 1000 * 60 * 60 // 1 hour)
});

// return a middleware handler for filepath
function dish (p, options) {
  options || (options = {});
  var headers = copy(options.headers || {});
  // lowercaseify header names
  Object.keys(headers).forEach(function (k) {
    if (k.match(/[A-Z]/)) {
      headers[k.toLowerCase()] = headers[k];
      delete headers[k];
    }
  });
  // default content type from file extension
  if (typeof headers['content-type'] === 'undefined') {
    headers['content-type'] = mime.lookup(p, options.defaultContentType);
  }
  var buffered = false;
  if (Buffer.isBuffer(p)) buffered = [p];
  else if (Array.isArray(p)) buffered = p;
  else if (!options.file) buffered = [Buffer(p)];

  // middleware handler
  var mw = function (req, res, next) {
    if (!next) next = function (e) { res.emit('error', e) };
    // try fetching from the LRU cache
    var file = cache.backend.get(p);
    // cache hit
    if (file) {
      var stream;
      // create a local copy of headers
      var resHeaders = copy(headers);
      // format etag
      if (typeof resHeaders.etag === 'undefined' && file.etag) {
        resHeaders.etag = file.etag;
      }
      // format last-modified
      if (typeof resHeaders['last-modified'] === 'undefined') {
        resHeaders['last-modified'] = file.lastModified.toUTCString();
      }
      // parse and handle conditional requests
      var d;
      try {
        d = Date.parse(req.headers['if-modified-since']);
      }
      catch (e) {}
      var lastModified = Math.floor(file.lastModified.getTime() / 1000) * 1000;
      if ((req.headers['if-none-match'] && req.headers['if-none-match'].replace(/"/g, '') === file.etag) || d >= lastModified) {
        res.statusCode = 304;
        stream = null;
      }
      if (req.method === 'HEAD') {
        stream = null;
      }
      if (stream === null) {
        delete resHeaders['content-encoding'];
        delete resHeaders['content-length'];
      }
      // parse and handle compression
      else if (file.gzipped && req.headers['accept-encoding'] && /gzip/i.exec(req.headers['accept-encoding'])) {
        resHeaders['content-encoding'] = 'gzip';
        resHeaders['content-length'] = file.gzippedLength;
        stream = from(file.gzipped);
      }
      else if (file.deflated && req.headers['accept-encoding'] && /deflate/i.exec(req.headers['accept-encoding'])) {
        resHeaders['content-encoding'] = 'deflate';
        resHeaders['content-length'] = file.deflatedLength;
        stream = from(file.deflated);
      }
      // normal uncompressed response
      else {
        resHeaders['content-length'] = file.length;
        stream = from(file.chunks);
      }
      // write the response
      res.writeHead(res.statusCode || options.status || 200, resHeaders);
      if (stream === null) res.end();
      else stream.pipe(res);
    }
    // cache miss
    else {
      // defer response until cached
      res.once('cached', function () {
        mw(req, res, next);
      });
      // start a file object
      file = {
        chunks: [],
        length: 0,
        gzipped: gzippable(headers['content-type']) ? [] : false,
        gzippedLength: 0,
        deflated: gzippable(headers['content-type']) ? [] : false,
        deflatedLength: 0,
        etag: '',
        lastModified: new Date()
      };
      // on cache miss, read from fs
      var latch = 1;
      var readStream = options.file ? fs.createReadStream(p) : from(buffered);
      // possibly gzip
      if (file.gzipped) {
        latch++;
        var gzipStream = zlib.createGzip();
        gzipStream.on('data', function (data) {
          file.gzipped.push(data);
          file.gzippedLength += data.length;
        });
        gzipStream.on('end', end);
        readStream.pipe(gzipStream);
        if (headers['vary'] && !vary.match(/accept\-encoding/i)) headers['vary'] += ', Accept-Encoding';
        else headers['vary'] = 'Accept-Encoding';
      }
      // possibly deflate
      if (file.deflated) {
        latch++;
        var deflateStream = zlib.createDeflate();
        deflateStream.on('data', function (data) {
          file.deflated.push(data);
          file.deflatedLength += data.length;
        });
        deflateStream.on('end', end);
        readStream.pipe(deflateStream);
        if (headers['vary'] && !headers['vary'].match(/accept\-encoding/i)) headers['vary'] += ', Accept-Encoding';
        else headers['vary'] = 'Accept-Encoding';
      }
      // compute etag
      latch++;
      var shaStream = crypto.createHash('sha1');
      shaStream.on('data', function (data) {
        file.etag = data.toString('hex');
      });
      shaStream.on('end', end);
      readStream.pipe(shaStream);
      // record data chunks for replay later
      readStream.on('data', function (data) {
        file.chunks.push(data);
        file.length += data.length;
      });
      readStream.on('end', end);
      readStream.on('error', next);

      function end () {
        if (!--latch) {
          cache.backend.set(p, file);
          res.emit('cached');
        }
      }
    }
  };
  return mw;
}

// file convenience wrapper
dish.file = function (p, options) {
  var opts = copy(options);
  opts.file = true;
  return dish(p, opts);
};

// exports
dish.cache = cache;
module.exports = dish;
