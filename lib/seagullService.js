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

var restify,
  server,
  log,
  servicePort;

restify = require('restify');

log = require('./log.js')('seagullService.js');

var seagullService = function (crudHandler, userApiHostGetter, envConfig) {

  //create the server depending on the type
  if (envConfig.httpPort != null) {
    servicePort = envConfig.httpPort;
    createServer({ name: 'TidepoolUserHttp' }, envConfig.userApi, crudHandler, userApiHostGetter);
  }

  if (envConfig.httpsPort != null) {
    servicePort = envConfig.httpsPort;
    createServer({ name: 'TidepoolUserHttps'}, envConfig.userApi, crudHandler, userApiHostGetter);
  }

  return {
    stop: stopService,
    start: startService
  };

};

function createServer(serverConfig, userApiConfig, crudHandler, userApiHostGetter) {
  log.info('Creating server[%s]', serverConfig.name);
  server = restify.createServer(serverConfig);
  server.use(restify.queryParser());
  server.use(restify.bodyParser());

  // this needs to become simpler
  var userApi = require('user-api-client');
  var userApiClient = userApi.client(userApiConfig, userApiHostGetter);
  var userApiMiddleware = userApi.middleware(userApiClient);
  var checkToken = userApiMiddleware.checkToken.bind(userApiMiddleware);
  var getMeta = userApiMiddleware.getMetaPair.bind(userApiMiddleware);

  var seagullApi = require('./routes/seagullApi')(crudHandler, userApiClient.getAnonymousPair);

  //health check
  server.get('/status', seagullApi.status);

  // get the valid collections
  server.post('/collections', checkToken, getMeta, seagullApi.metacollections);

  // manage the basic collection contents (at the top level)
  server.post('/:userid/:collection', checkToken, getMeta, seagullApi.metaroot_create);
  server.get('/:userid/:collection', checkToken, getMeta, seagullApi.metaroot_read);
  server.put('/:userid/:collection', checkToken, getMeta, seagullApi.metaroot_update);
  server.del('/:userid/:collection', checkToken, getMeta, seagullApi.metaroot_delete);

  // manage the group information
  server.post('/group/:userid/:collection/:name', checkToken, getMeta, seagullApi.metagroup_create);
  server.get('/group/:userid/:collection/:name', checkToken, getMeta, seagullApi.metagroup_read);
  server.put('/group/:userid/:collection/:name', checkToken, getMeta, seagullApi.metagroup_updateOrDelete);
  server.del('/group/:userid/:collection/:name', checkToken, getMeta, seagullApi.metagroup_updateOrDelete);

  // manage the private information
  server.post('/private/:userid/:collection/:name', checkToken, getMeta, seagullApi.metaprivate_create);
  server.get('/private/:userid/:collection/:name', checkToken, getMeta, seagullApi.metaprivate_read);
  server.put('/private/:userid/:collection/:name', checkToken, getMeta, seagullApi.metaprivate_updateOrDelete);
  server.del('/private/:userid/:collection/:name', checkToken, getMeta, seagullApi.metaprivate_updateOrDelete);

}

function stopService() {
  log.info('Stopping the Seagull API server');
  server.close();
}

function startService(cb) {
  log.info('Start Seagull API server serving on port[%s]', servicePort);
  server.listen(servicePort, cb);
}

module.exports = seagullService;