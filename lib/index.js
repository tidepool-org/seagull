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


var logMaker = require('./log.js');
var log = logMaker('lib/index.js');

(function () {
  'use strict';

  var config = require('../env.js');
  var mongoConfig = {
    saltDeploy: config.saltDeploy,
    mongoConnectionString: config.mongoConnectionString
  };

  var hakkenClient = require('hakken')(config.discovery).client();
  hakkenClient.start();

  var userApiWatch = hakkenClient.watchFromConfig(config.userApi.serviceSpec);
  userApiWatch.start();
  //Resolve user names
  var armadaWatch = hakkenClient.watchFromConfig(config.armada.serviceSpec);
  armadaWatch.start();

  var service = require('./seagullService.js')(
    config,
    require('./mongoCrudHandler.js')(mongoConfig),
    require('user-api-client').client(config.userApi, userApiWatch),
    require('tidepool-armada-client')(armadaWatch,config.armada),
    require('user-api-client').metrics.createMetrics(config, log)
  );

  //let's get this party started
  service.start(function (err) {
    if (err != null) {
      throw err;
    }

    var serviceDescriptor = { service: config.serviceName };
    if (config.httpsPort != null) {
      serviceDescriptor.host = config.publishHost + ':' + config.httpsPort;
      serviceDescriptor.protocol = 'https';
    } else if (config.httpPort != null) {
      serviceDescriptor.host = config.publishHost + ':' + config.httpPort;
      serviceDescriptor.protocol = 'http';
    }

    log.info('Publishing service[%j]', serviceDescriptor);
    hakkenClient.publish(serviceDescriptor);
  });
})();
