/*
 == BSD2 LICENSE ==
 Copyright (c) 2014, Tidepool Project

 This program is free software; you can redistribute it and/or modify it under
 the terms of the associated License, which is identical to the BSD 2-Clause
 License as published by the Open Source Initiative at opensource.org.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE. See the License for more details.

 You should have received a copy of the License along with this program; if
 not, you can obtain one from Tidepool Project at tidepool.org.
 == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var restify = require('restify');
var errors = require('restify-errors');

var log = require('./log.js')('seagullService.js');

function createServer(serverConfig, crudHandler, userApiClient, gatekeeperClient, metrics) {
  log.info('Creating server[%s]', serverConfig.name);
  var app = restify.createServer(serverConfig);
  app.use(restify.plugins.queryParser());
  app.use(restify.plugins.bodyParser());

  var userApi = require('user-api-client');

  var checkToken = userApi.middleware.checkToken(userApiClient);
  var permissions = require('amoeba').permissions(gatekeeperClient);

  var requireCustodian = function (req, res, next) {
    return permissions.requireCustodian(req, res, next);
  };
  var requireServer = function (req, res, next) {
    return permissions.requireServer(req, res, next);
  };
  var requireMembership = function (req, res, next) {
    return permissions.requireMembership(req, res, next);
  };

  var seagullApi = require('./routes/seagullApi')(crudHandler, userApiClient, gatekeeperClient, metrics);

  //health check
  app.get('/status', seagullApi.status);

  // unified users
  app.get('/users/:userid/users', checkToken, requireCustodian, seagullApi.users);

  // get the valid collections
  app.get('/collections', seagullApi.metacollections);

  // manage the private information
  app.get('/:userid/private/:name', checkToken, requireServer, seagullApi.metaprivate_read);
  app.del('/:userid/private/:name', checkToken, requireServer, seagullApi.metaprivate_delete);

  var notImplemented = function (req, res, next) {
    return next(new errors.NotFoundError());
  };

  app.get('/:userid/private', notImplemented);
  app.post('/:userid/private', notImplemented);
  app.put('/:userid/private', notImplemented);
  app.del('/:userid/private', notImplemented);

  // manage the collections contents (at the top level)
  app.post('/:userid/:collection', checkToken, requireCustodian, seagullApi.metacollection_update);
  app.get('/:userid/:collection', checkToken, requireMembership, seagullApi.metacollection_read);
  app.put('/:userid/:collection', checkToken, requireCustodian, seagullApi.metacollection_update);
  app.del('/:userid/:collection', checkToken, requireCustodian, seagullApi.metacollection_delete);

  app.on('uncaughtException', function (req, res, route, err) {
    log.error(err, 'Uncaught exception on route[%s]!', route.spec ? route.spec.path : 'unknown');
    res.send(500);
  });

  app.on('close', function() {
    seagullApi.close();
    app.removeAllListeners();
  })
  return app;
}

module.exports = function seagullService(envConfig, crudHandler, userApiClient, gatekeeperClient, metrics) {
  var server = null;
  var servicePort = null;

  //create the server depending on the type
  if (envConfig.httpPort != null) {
    servicePort = envConfig.httpPort;
    server = createServer(
      { name: 'SeagullHttp' },
      crudHandler,
      userApiClient,
      gatekeeperClient,
      metrics
    );
  }

  if (envConfig.httpsPort != null) {
    servicePort = envConfig.httpsPort;
    server = createServer(
      _.extend({ name: 'SeagullHttps' },
        envConfig.httpsConfig),
      crudHandler,
      userApiClient,
      gatekeeperClient,
      metrics
    );
  }

  return {
    close: function () {
      log.info('Stopping the Seagull API server');
      server.close();
    },
    start: function (cb) {
      log.info('Start Seagull API server serving on port[%s]', servicePort);
      server.listen(servicePort, cb);
    }
  };
};
