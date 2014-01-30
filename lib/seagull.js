// seagull.js
// --------
// This is the module for managing Tidepool user metadata.
// 

/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */


module.exports = function(envConfig, userService) {
  // We use strict because we're only worried about modern browsers and we should be strict.
  // JSHint actually insists on this and it's a good idea.
  'use strict';

  // It's also a good idea to predeclare all variables at the top of a scope. Javascript doesn't
  // support block scoping so putting them all at the beginning helps make it obvious which vars
  // are intended to be module-level.
  var
    _,
    crypto,
    echo,
    log,
    saltDeploy,
    secret,
    userApi;

  saltDeploy = envConfig.saltDeploy;
  secret = envConfig.secret;

  // and we need a functional logging service, and we
  // tell it what file we're using (or just supply a logger)
  log = envConfig.logger || require('./log.js').createLogger(envConfig.logName);

  // helpful utilities
  _ = require('lodash');
  crypto = require('crypto-js');

  var discoveryConfig = config.discovery;
  hakkenClient = require('hakken')(discoveryConfig).client.make();
  hakkenClient.start();

  hostGetter = hakkenClient.randomWatch(config.userApiService);
  hostGetter.start();


  userApi = require('user-api-client').client(envConfig, hostGetter);

  ////////////// HELPER FUNCTIONS ///////////////////

  var setSalt = function(salt) {
    log.info('deployment salt value was set');
    saltDeploy = salt;
  };

  var hasall = function(object, keys) {
    var retval = true;
    _.each(keys, function(k) {
      if (!_.has(object, k)) {
        retval = false;
      }
    });
    return retval;
  };


  ///////////////// middleware ///////////////////////

  // middleware to check if this user can see the requested userid
  function usercheck(req, res, next) {
    if ((req._tokendata.userid === req.params.userid) || (req._tokendata.server)) {
      return next();
    } else {
      res.send(401, 'Unauthorized');
      res.end();
      return;
    }
  }

  // middleware to retrieve the meta information from the user-api

  function fetchMetaFromUserAPI(req, res, next) {

    if ((req._tokendata.uid === req.params.userid) || (req._tokendata.svr === 'yes')) {
      return next();
    } else {
      res.send(401, 'Unauthorized');
      res.end();
      return;
    }
  }


  //////////////////// ENDPOINT IMPLEMENTATIONS ////////////////////

  function metacollections (req, res, next) {
    res.send(200, [ 'profile' ]);
    return next();
  };

  function metaroot(req, res, next) {
  };


  // all our apis have a status function; this one lets you force a status code
  // with a parameter so we can test error handling
  var status = function(req, res, next) {
    log.info('status', req.params, req.url, req.method);

    if (req.params.status) {
      res.send(parseInt(req.params.status));
    } else {
      userService.status(function(err, result) {
        log.info('returning status ' + result.statuscode);
        res.send(result.statuscode, result.deps);
      });
    }
    return next();
  };


  // We need to have sensible responses for all the standard verbs, so we've got a system that makes
  // it easy to reuse the same handlers for different verbs.

  // API
  // every individual is a user. users have a unique id which they normally don't see; they
  // identify with their username. Users may have the doctor bit set; if so, they'll see
  // any doctor-specific features, and they can be searched for when a patient is setting
  // up an account.
  // Users may also have the patient bit set; if they do, there is an event stream set up for them.

  var v01api = [
    { path: '/status', verb: 'get', func: status },
    { path: '/collections', verb: 'post', func: [tokencheck, metacollections] },
    { path: '/:userid/:collection', verbs: ['post', 'get', 'put', 'del'], func: [tokencheck, usercheck, metaroot] },
    { path: '/group/:userid/:collection', verbs: ['post', 'get', 'put', 'del'], func: [tokencheck, usercheck, metagroup] },
    { path: '/private/:userid/:collection', verbs: ['post', 'get', 'put', 'del'], func: [tokencheck, usercheck, metaprivate] }
  ];

  // helper function to set up one endpoint for one verb
  var doVerb = function(server, verb, path, version, func) {
    server[verb]({path: path, version: version }, func);
  };

  // installs all the items defined in a version of the API
  var installAPI = function(server, api, version) {
    _.each(api, function(elt, idx, list) {
      if (elt.verbs) {
        _.each(elt.verbs, function(verb) {
          doVerb(server, verb, elt.path, version, elt.func);
        });
      }
      else if (elt.verb) {
        doVerb(server, elt.verb, elt.path, version, elt.func);
      }
    });
  };

  return {
    attachToServer: function(restifyServer) {
      installAPI(restifyServer, v01api, '0.1.2');
    },
    secret: secret,         // this is set by the client
    salt: setSalt                  // this is set by the client
    /*,
    installAPI: installAPI
    */
  };
};

