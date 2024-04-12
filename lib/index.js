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

var amoeba = require('amoeba');

var events = require('./events.js');

var logMaker = require('./log.js');
var log = logMaker('lib/index.js');

(async function () {

  var config = require('../env.js');
  var mongoConfig = {
    mongoConnectionString: config.mongoConnectionString
  };

  var gatekeeperGetter = {
    get: function() { return config.gatekeeper.serviceSpec.hosts; }
  };
  
  var metricsGetter = {
    get: function() { return config.metrics.serviceSpec.hosts; }
  };

  var userApiGetter = {
    get: function() { return config.userApi.serviceSpec.hosts; }
  };

  var httpClient = amoeba.httpClient();
  var userApiClient = require('user-api-client').client(config.userApi, userApiGetter);

  const mongoCrudHandler = require('./mongoCrudHandler.js')(mongoConfig);

  const eventsLogger = logMaker('events.js');
  const eventsConfig = amoeba.events.loadConfigFromEnv();
  const userEventsHandler = events.createUserEventsHandler(mongoCrudHandler, eventsLogger);
  const consumer = await amoeba.events.createEventConsumer(eventsConfig, userEventsHandler, eventsLogger);

  var service = require('./seagullService.js')(
    config,
    mongoCrudHandler,
    userApiClient,
    require('tidepool-gatekeeper').client(
      httpClient,
      userApiClient.withServerToken.bind(userApiClient),
      gatekeeperGetter
    ),
    require('user-api-client').metrics(
      metricsGetter,
      config,
      log
    ),
    consumer,
  );

  service.start();

})().catch( e => { console.error(e); } );
