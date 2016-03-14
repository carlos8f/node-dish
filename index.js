var crypto = require('crypto')
  , zlib = require('zlib')
  , fs = require('fs')
  , from = require('from')
  , LRU = require('lru-cache')
  , mime = require('mime')
  , minimatch = require('minimatch')

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
  var buffered_file;

  // middleware handler
  var mw = function (req, res, next) {
    var statusCode = 200;
    if (options.status) statusCode = options.status;
    if (typeof next === 'number') {
      statusCode = next;
      next = null;
    }
    if (!next) next = function (e) { res.emit('error', e) };
    // try fetching from the LRU cache
    var file = options.file ? cache.backend.get(p) : buffered_file;
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
        statusCode = 304;
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
      res.writeHead(statusCode, resHeaders);
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
        gzipStream.once('end', end);
        readStream.pipe(gzipStream);
        if (headers['vary'] && !headers['vary'].match(/accept\-encoding/i)) headers['vary'] += ', Accept-Encoding';
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
        deflateStream.once('end', end);
        readStream.pipe(deflateStream);
        if (headers['vary'] && !headers['vary'].match(/accept\-encoding/i)) headers['vary'] += ', Accept-Encoding';
        else headers['vary'] = 'Accept-Encoding';
      }
      // compute etag
      latch++;
      var shaStream = crypto.createHash('sha1');
      shaStream.once('data', function (data) {
        file.etag = data.toString('hex');
      });
      shaStream.once('end', end);
      readStream.pipe(shaStream);
      // record data chunks for replay later
      readStream.on('data', function (data) {
        file.chunks.push(data);
        file.length += data.length;
      });
      readStream.once('end', end);
      readStream.once('error', next);

      function end () {
        if (!--latch) {
          if (options.file) cache.backend.set(p, file);
          else buffered_file = file;
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

dish.clearCache = function (p) {
  if (p) {
    // delete items in subdirectories
    cache.backend.keys().forEach(function (k) {
      if (typeof k === 'string' && minimatch(k, '{' + p + ',' + p.replace(/\/$/, '') + '/**/*}')) {
        cache.backend.del(k);
      }
    });
    cache.backend.del(p);
  }
  else cache.backend.reset();
};

// exports
dish.cache = cache;
module.exports = dish;
