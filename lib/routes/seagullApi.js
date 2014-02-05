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

var util = require('util');

var _ = require('lodash');

var log = require('../log.js')('seagullApi.js');

/*
 Http interface for group-api
 */
module.exports = function (crudHandler, userApiClient) {

  /*
   HELPERS
   */

  function createDocAndCallback(metaPair, res, next, cb) {
    crudHandler.createDoc(metaPair, {}, function (err, result) {
      if (err) {
        log.error(err, 'Error creating metadata doc');
        if (err.statuscode == 400) {
          res.send(422);
        } else {
          res.send(err.statuscode);
        }
        return next();
      } else {
        cb();
      }
    });
  }

  return {
    /** HEALTH CHECK **/
    status: function (req, res, next) {
      log.debug('status: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      if (req.params.status) {
        res.send(parseInt(req.params.status));
      } else {
        crudHandler.status(function (error, result) {
          log.debug('returning status ' + result.statuscode);
          res.send(result.statuscode, result.deps);
        });
      }
      return next();
    },

    /*
     IMPLEMENTATIONS OF METHODS
     */

    metacollections: function (req, res, next) {
      log.debug('metacollections: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(200, [ 'profile', 'groups', 'private' ]);
      return next();
    },

    metacollection_read: function (req, res, next) {
      log.debug('metacollection_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var collection = req.params.collection;
      if (collection == null) {
        res.send(400, 'No collection specified');
        return next();
      }

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(err.statuscode);
        } else {
          var retVal = result.detail[collection];
          if (retVal == null) {
            res.send(404);
          } else {
            res.send(200, retVal);
          }
        }
        return next();
      });
    },

    metacollection_update: function (req, res, next) {
      log.debug('metacollection_update: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var collection = req.params.collection;
      if (collection == null) {
        res.send(400, 'No collection specified');
        return next();
      }

      var updates = req.body;
      if (updates == null) {
        res.send(400, 'Must have a body');
        return next();
      }

      updates = _.reduce(updates, function (accum, update, key) {
        accum[util.format('%s.%s', collection, key)] = update;
        return accum;
      }, {});

      function doUpdate(addIfNotThere) {
        var metaPair = req._metapair;
        crudHandler.partialUpdate(metaPair, updates, function (err, result) {
          if (err) {
            if (err.statuscode == 404 && addIfNotThere) {
              return createDocAndCallback(metaPair, res, next, function () { doUpdate(false); });
            } else {
              log.error(err, 'Error updating metadata doc');
              res.send(err.statuscode);
              return next();
            }
          } else {
            res.send(200, result.detail[collection]);
            return next();
          }
        });
      }

      doUpdate(true);
    },

    metacollection_delete: function (req, res, next) {
      log.debug('metacollection_delete: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(501); // not implemented
      return next();
    },

    metaprivate_create: function (req, res, next) {
      log.debug('metaprivate_create: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

    },

    metaprivate_read: function (req, res, next) {
      log.debug('metaprivate_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var self = this;
      var metaPair = req._metapair;

      var name = req.params.name;
      if (name == null) {
        res.send(400, 'No name specified');
        return next();
      }

      function getPrivatePair(addIfNotThere) {
        crudHandler.getDoc(metaPair, function (err, mongoResult) {
          if (err) {
            log.error(err, 'Error reading metadata doc');
            if (err.statuscode === 404 && addIfNotThere) {
              return createDocAndCallback(metaPair, res, next, function () { getPrivatePair(addIfNotThere); });
            }
            res.send(err.statuscode);
          } else {
            var result = mongoResult.detail;
            // we have the doc now, let's see if it has the group
            if (result.private && result.private[name]) {
              res.send(200, result.private[name]);
              return next();
            } else {
              if (addIfNotThere) {
                return makeNewHash();
              } else {
                res.send(404);
              }
            }
          }
          return next();
        });
      }

      function makeNewHash() {
        // generate a private pair
        userApiClient.getAnonymousPair(req._tokendata.userid, function (err, pair) {
          if (err != null) {
            log.info(err, 'Unable to generate a new anonymous pair!');
            res.send(500);
            return next();
          } else {
            var update = {};
            update['private.' + name] = pair;
            crudHandler.partialUpdate(req._metapair, update, function (err, result) {
              if (err) {
                log.error(err, 'Error creating metadata doc');
                if (err.statuscode == 404) {
                  res.send(404);
                  return next();
                } else {
                  res.send(err.statuscode);
                  return next();
                }
              } else {
                res.send(200, result.detail.private[name]);
                return next();
              }
            });
          }
        });
      }

      getPrivatePair(true);
    },

    metaprivate_delete: function (req, res, next) {
      log.debug('metaprivate_delete: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(501); // not implemented
      return next();
    }
  };
};
