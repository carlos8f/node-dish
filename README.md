dish
====

miniature in-memory http static middleware optimized for serving buffers or strings

[![build status](https://secure.travis-ci.org/carlos8f/node-dish.png)](http://travis-ci.org/carlos8f/node-dish)

Given a file path, string or buffer, **dish** will create you an HTTP server request
listener, with added benefits:

- gzip support
- ETag / Conditional GET support
- In-memory cache (faster than accessing the disk for every request)
- HTTP keep-alive timeout

Install
-------

```
$ npm install --save dish
```

Basic usage
-----------

To serve a raw string or buffer:

```js
var dish = require('dish')
  , server = require('http').createServer()

server.on('request', dish('hello world!')); // can also accept a Buffer instance
server.listen(3000);
```

To serve a file (mime-type autodetected from file name)

```js
server.on('request', dish.file('./facepalm.jpg'));
```

Options
-------

You can pass options as the second parameter to `dish()`.

- `headers` (Object) - override / specify headers to send. Be sure to set a `Content-Type`
  header if you are serving a string or buffer.
- <del>keepAlive</del>: **This option is removed as of `v0.1.6`**. The intention was to
  clean up idle connections, but the implementation was shown to
  [abort active requests](https://github.com/carlos8f/node-buffet/issues/14).
  Please do not use this option!
- `maxAge` (Number) - Proxy cache lifetime in seconds. Use this if you are using
  a reverse proxy such as Varnish.
- `gzip` (Boolean) - Set to `false` to disable gzip in responses.

### Status code

You can control the status code of the response by passing a Number as the third
argument of the request handler:

```js
var handler = dish('page not found');
server.on('request', function (req, res) {
  if (req.url === '/nonsense') {
    handler(req, res, 404); // Status code will be 404
  }
});
```

Example as middleware
---------------------

```js
var dish = require('dish')
  , middler = require('middler')
  , server = require('http').createServer()

middler(server)
  // a simple "about us" page
  .get('/about', dish.file('./about.html'))
  // Serve a dynamic javascript file with gzip support:
  .get('/my-code.js', function (req, res, next) {
    // create some dynamic javascript...
    var myCode = 'var myNumber = ' + Math.random();
    // serve it
    dish(myCode, {headers: {'Content-Type': 'text/javascript'}})(req, res);
  });

server.listen(3000);
```

- - -

### Developed by [Terra Eclipse](http://www.terraeclipse.com)
Terra Eclipse, Inc. is a nationally recognized political technology and
strategy firm located in Aptos, CA and Washington, D.C.

- - -

### License: MIT

- Copyright (C) 2012 Carlos Rodriguez (http://s8f.org/)
- Copyright (C) 2012 Terra Eclipse, Inc. (http://www.terraeclipse.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the &quot;Software&quot;), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.