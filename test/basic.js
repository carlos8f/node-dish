describe('basic test', function () {
  var server, baseUrl;
  before(function (done) {
    listen(function (s, port) {
      server = s;
      baseUrl = 'http://localhost:' + port;
      done();
    });
  });

  it('serve a string', function (done) {
    server.once('request', dish('hello :D'));
    request
      .get(baseUrl + '/')
      .set('Accept-Encoding', 'deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 8);
        // etag should be sha1
        assert.equal(res.headers['etag'], '18eddd4897daa9d6096014988cd07f7b688ac46f');
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be default
        assert.equal(res.headers['content-type'], 'application/octet-stream');
        // proper content
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.once('end', function () {
          assert.equal(data, 'hello :D');
          done();
        });
      });
  });

  it('override content-type', function (done) {
    server.once('request', dish('<partytime>carlos</partytime>', {headers: {'Content-Type': 'text/html'}}));
    request
      .get(baseUrl + '/')
      .set('Accept-Encoding', 'deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 29);
        // etag should be sha1
        assert.equal(res.headers['etag'], '0280e0568eb75bdecb28837d0ac3082140817468');
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be default
        assert.equal(res.headers['content-type'], 'text/html');
        // proper content
        assert.equal(res.text, '<partytime>carlos</partytime>');
        done();
      });
  });

  it('serve a text file', function (done) {
    server.once('request', dish.file(path.join(__dirname, 'fixtures', 'hello.txt')));
    request
      .get(baseUrl + '/')
      .set('If-Modified-Since', 'Fri, 18 Jan 2013 20:50:19 GMT')
      .set('If-None-Match', 'c01b3f9f12197efbde09ae7870fb39d092a6f6f9')
      .set('Accept-Encoding', 'deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 12);
        // etag should be sha1
        assert.equal(res.headers['etag'], '430ce34d020724ed75a196dfc2ad67c77772d169');
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be text/plain
        assert.equal(res.headers['content-type'], 'text/plain');
        // proper content
        assert.equal(res.text, 'hello world!');
        done();
      });
  });

  it('serve an image', function (done) {
    server.once('request', dish.file(path.join(__dirname, 'fixtures', 'pirate_flag.png')));
    request
      .get(baseUrl + '/')
      .set('Accept-Encoding', 'gzip, deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 15673);
        // etag should be sha1
        if (fs.exists) {
          assert.equal(res.headers['etag'], 'ac82f5998d5a621eda3feb8837b2bdd0421be590');
        }
        else {
          // node 0.6 is weird.
          assert.equal(res.headers['etag'], '5633b5aa1a8485e58c4ad0cf6ffbac6ae8ec81ef');
        }
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be text/plain
        assert.equal(res.headers['content-type'], 'image/png');
        // proper content
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.once('end', function () {
          assert.equal(fs.readFileSync(path.join(__dirname, 'fixtures', 'pirate_flag.png')).toString(), data);
          done();
        });
      });
  });

  it('serve buffer', function (done) {
    server.once('request', dish(fs.readFileSync(path.join(__dirname, 'fixtures', 'pirate_flag.png')), {headers: {'Content-Type': 'image/png'}}));
    request
      .get(baseUrl + '/')
      .set('Accept-Encoding', 'gzip, deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 15673);
        // etag should be sha1
        if (fs.exists) {
          assert.equal(res.headers['etag'], 'ac82f5998d5a621eda3feb8837b2bdd0421be590');
        }
        else {
          // node 0.6 is weird.
          assert.equal(res.headers['etag'], '5633b5aa1a8485e58c4ad0cf6ffbac6ae8ec81ef');
        }
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be text/plain
        assert.equal(res.headers['content-type'], 'image/png');
        // proper content
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.once('end', function () {
          assert.equal(fs.readFileSync(path.join(__dirname, 'fixtures', 'pirate_flag.png')).toString(), data);
          done();
        });
      });
  });

  var lastModified, eTag;

  it('serve gzipped', function (done) {
    server.on('request', dish.file(path.join(__dirname, 'fixtures', 'hello.txt')));
    request
      .get(baseUrl + '/')
      .set('Accept-Encoding', 'gzip, deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 32);
        // etag should be sha1
        assert.equal(res.headers['etag'], '430ce34d020724ed75a196dfc2ad67c77772d169');
        eTag = res.headers['etag'];
        // last-modified should be set
        assert(res.headers['last-modified']);
        lastModified = res.headers['last-modified'];
        // content-type should be text/plain
        assert.equal(res.headers['content-type'], 'text/plain');
        // proper content
        assert.equal(res.text, 'hello world!');
        done();
      });
  });

  it('if-none-match', function (done) {
    request
      .get(baseUrl + '/')
      .set('If-None-Match', eTag)
      .set('Accept-Encoding', 'deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 304);
        assert(!res.text);
        done();
      });
  });

  it('if-modified-since', function (done) {
    request
      .get(baseUrl + '/')
      .set('If-Modified-Since', lastModified)
      .end(function (res) {
        assert.equal(res.statusCode, 304);
        assert(!res.text);
        done();
      });
  });

  it('serve 200 again', function (done) {
    request
      .get(baseUrl + '/')
      .set('If-Modified-Since', 'Fri, 18 Jan 2013 20:50:19 GMT')
      .set('If-None-Match', 'c01b3f9f12197efbde09ae7870fb39d092a6f6f9')
      .set('Accept-Encoding', 'deflate')
      .end(function (res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-length'], 12);
        // etag should be sha1
        assert.equal(res.headers['etag'], '430ce34d020724ed75a196dfc2ad67c77772d169');
        // last-modified should be set
        assert(res.headers['last-modified']);
        // content-type should be text/plain
        assert.equal(res.headers['content-type'], 'text/plain');
        // proper content
        assert.equal(res.text, 'hello world!');
        done();
      });
  });

  it('shut down server', function (done) {
    server.once('close', done);
    server.close();
  });
});