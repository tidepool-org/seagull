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

var log = require('./log.js')('seagullService.js');

function createServer(serverConfig, crudHandler, userApiClient, metrics) {
  log.info('Creating server[%s]', serverConfig.name);
  var retVal = restify.createServer(serverConfig);
  retVal.use(restify.queryParser());
  retVal.use(restify.bodyParser());

  var userApi = require('user-api-client');
  var checkToken = userApi.middleware.checkToken(userApiClient);
  var getMeta = require('./getMetaPair')(userApiClient);

  function requireServerToken(req, res, next) {
    if (req._tokendata != null && req._tokendata.isserver) {
      return next();
    }
    res.send(401, 'Insufficient Permissions');
    return next(false);
  }

  var seagullApi = require('./routes/seagullApi')(crudHandler, userApiClient, metrics);

  //health check
  retVal.get('/status', seagullApi.status);

  // get the valid collections
  retVal.get('/collections', seagullApi.metacollections);

  // manage the private information
  retVal.get('/:userid/private/:name', checkToken, requireServerToken, getMeta, seagullApi.metaprivate_read);
  retVal.del('/:userid/private/:name', checkToken, requireServerToken, getMeta, seagullApi.metaprivate_delete);

  var notImplemented = function(req, res, next) { res.send(404); next(); };

  retVal.get('/:userid/private', notImplemented);
  retVal.post('/:userid/private', notImplemented);
  retVal.put('/:userid/private', notImplemented);
  retVal.del('/:userid/private', notImplemented);

  // manage the collections contents (at the top level)
  retVal.post('/:userid/:collection', checkToken, getMeta, seagullApi.metacollection_update);
  retVal.get('/:userid/:collection', checkToken, getMeta, seagullApi.metacollection_read);
  retVal.put('/:userid/:collection', checkToken, getMeta, seagullApi.metacollection_update);
  retVal.del('/:userid/:collection', checkToken, getMeta, seagullApi.metacollection_delete);


  retVal.on('uncaughtException', function(req, res, route, err){
    log.error(err, 'Uncaught exception on route[%s]!', route.spec ? route.spec.path : 'unknown');
    res.send(500);
  });

  return retVal;
}

module.exports = function seagullService(envConfig, crudHandler, userApiClient, metrics) {
  var server = null;
  var servicePort = null;

  //create the server depending on the type
  if (envConfig.httpPort != null) {
    servicePort = envConfig.httpPort;
    server = createServer(
      { name: 'SeagullHttp' },
      crudHandler,
      userApiClient,
      metrics);
  }

  if (envConfig.httpsPort != null) {
    servicePort = envConfig.httpsPort;
    server = createServer(
      _.extend({ name: 'SeagullHttps' },
        envConfig.httpsConfig),
      crudHandler,
      userApiClient,
      metrics);
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