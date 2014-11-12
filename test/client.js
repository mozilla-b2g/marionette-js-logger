var Marionette = require('marionette-client');
var Rocketbar = require('./rocketbar');
var Search = require('./search');
var Server = require('./server_helper/server');
var System = require('./system');
var assert = require('assert');

suite('client', function() {
  var rocketbar, search, server, system;

  marionette.plugin('logger', require('../'));
  marionette.plugin('apps', require('marionette-apps'));
  marionette.plugin('helper', require('marionette-helper'));

  var client = marionette.client({
    settings: {
      'ftu.manifestURL': '',
      'screen.timeout': 0,
      'lockscreen.enabled': false,
      'lockscreen.locked': false
    }
  });

  /**
   * Generate a local url
   */
  function localUrl(path) {
    return 'http://localhost:' + server.port + '/' + path;
  }

  suiteSetup(function(done) {
   Server.create(function(err, _server) {
      server = _server;
      done();
    });
  });

  setup(function() {
    rocketbar = new Rocketbar(client);
    search = new Search(client);
    search.removeGeolocationPermission();
    system = new System(client);
    system.waitForStartup();
  });

  suiteTeardown(function() {
    server.stop();
  });

  test('console', function() {
    var gotMessage = false;

    // - Check that waitForLogMessage works against our same chrome context
    // This also exercises grabAtLeastOneNewMessage
    client.logger.on('message', function(msg) {
      if (msg.message.indexOf('foobar!') !== -1) {
        gotMessage = true;
      }
    });

    // NOTE!  There is up to a 15ms delay before this log message will actually
    // be logged.
    client.executeScript(function() {
      console.log('foobar!', { 'muy thing': true });
    });
    client.logger.waitForLogMessage(function(msg) {
      return (msg.message.indexOf('foobar!') !== -1);
    });

    assert(gotMessage);

    // - Now check that our synchronous grabLogMessages works too
    gotMessage = false;

    // make sure the message didn't get stuck in the system so that we keep
    // seeing it over and over!
    client.logger.grabLogMessages();
    assert(!gotMessage);

    // log it again...
    client.executeScript(function() {
      console.log('foobar!', { 'moo thing': true });
    });
    // and wait long enough for the Firefox 15ms batching to have definitely
    // expired.
    client.helper.wait(30);
    client.logger.grabLogMessages();
    assert(gotMessage);

    // - Now check our timeout mechanism without us logging anything
    // (Note that other things may cause logging to happen, so this may end up
    // doing what our next case tries to do too.)

    // Disable the default onScriptTimeout which likes to take a screenshot
    // and spams stdout.
    client.onScriptTimeout = null;

    var clockStartedAt = Date.now();
    assert.throws(function() {
      client.logger.waitForLogMessage(function() {
        // never match anything!
        return false;
      }, 100);
    }, Error);
    var clockStoppedAt = Date.now();
    assert(clockStoppedAt > clockStartedAt + 95, 'correct duration');

    // - Check our timeout with us logging a few things
    clockStartedAt = Date.now();
    assert.throws(function() {
      client.executeScript(function() {
        console.log('0ms');
        window.setTimeout(function() {
          console.log('20ms');
        }, 20);
        window.setTimeout(function() {
          console.log('40ms');
        }, 40);
        window.setTimeout(function() {
          console.log('60ms');
        }, 60);
        window.setTimeout(function() {
          console.log('80ms');
        }, 80);
      });
      client.logger.waitForLogMessage(function() {
        // never match anything!
        return false;
      }, 100);
    }, Error);
    clockStoppedAt = Date.now();
    assert(clockStoppedAt > clockStartedAt + 95, 'correct duration');
  });

  test('get logs from (nested) mozbrowser iframes', function() {
    var unique = '____I_AM_SO_UNIQUE___';
    var gotEmitted = false;

    // this gets emitted before our waitForLogMessage gets a chance
    client.logger.on('message', function(msg) {
      if (msg.message.indexOf(unique) !== -1) {
        gotEmitted = true;
      }
    });

    // Launch browser and navigate to index.html.
    rocketbar.homescreenFocus();
    rocketbar.enterText(localUrl('index.html') + '\uE006');

    client.logger.waitForLogMessage(function(msg) {
      return msg.message.indexOf(unique) !== -1;
    });
    assert(gotEmitted);
  });

  test('Catches content errors', function() {
    var gotEmitted = false;

    // this gets emitted before our waitForLogMessage gets a chance
    client.logger.on('message', function(msg) {
      if (msg.message.indexOf('SyntaxError') !== -1 &&
          msg.filename.indexOf('error.html') !== -1) {
        gotEmitted = true;
      }
    });

    // Launch browser and navigate to error.html.
    rocketbar.homescreenFocus();
    rocketbar.enterText(localUrl('error.html') + '\uE006');

    client.logger.waitForLogMessage(function(msg) {
      return msg.message.indexOf('SyntaxError') !== -1;
    });
    assert(gotEmitted);
  });
});
