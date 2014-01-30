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

var log = require('../log.js')('seagullApi.js');

/*
 Http interface for group-api
 */
module.exports = function (crudHandler, getAnonymousPair) {

  /*
   HELPERS
   */

  return {
    /** HEALTH CHECK **/
    status: function (req, res, next) {
      log.debug('status: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      if (req.params.status) {
        res.send(parseInt(req.params.status));
      }
      else {
        crudHandler.status(function (error, result) {
          log.info('returning status ' + result.statuscode);
          res.send(result.statuscode, result.deps);
        });
      }
      return next();
    },

    /*
     IMPLEMENTATIONS OF METHODS
     */

    // expects that checkToken and getMeta have already been run on this path
    metacollections: function (req, res, next) {
      log.debug('metacollections: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(200, [ 'profile' ]);
      return next();
    },

    metaroot_create: function (req, res, next) {
      log.debug('metaroot_create: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var payload = JSON.parse(req.body);
      // TODO: check payload for validity

      crudHandler.createDoc(req._metapair, payload, function (err, result) {
        if (err) {
          log.error(err, 'Error creating metadata doc');
          res.send(500);
        } else {
          res.send(201, payload);
        }
        return next();
      });
    },

    metaroot_read: function (req, res, next) {
      log.debug('metaroot_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(500);
        } else {
          res.send(200, result);
        }
        return next();
      });
    },

    metaroot_update: function (req, res, next) {
      log.debug('metaroot_update: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var updates = JSON.parse(req.body);
      // TODO: check payload for validity      

      crudHandler.partialUpdate(req._metapair, updates, function (err, result) {
        if (err) {
          log.error(err, 'Error updating metadata doc');
          res.send(500);
        } else {
          res.send(200, result);
        }
        return next();
      });
    },

    metaroot_delete: function (req, res, next) {
      log.debug('metaroot_delete: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(501); // not implemented
      return next();
    },

    metagroup_create: function (req, res, next) {
      log.debug('metagroup_create: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var groupid = JSON.parse(req.body);   // this is the group ID to store
      // TODO: check groupid for validity

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(500);
        } else {
          // we have the doc now, let's see if it has the group
          if (result.groups && result.groups[req.params.name]) {
            res.send(400); // duplicate key
          } else {
            var update = {};
            update['groups.' + req.params.name] = groupid;
            crudHandler.partialUpdate(req._metapair, update, function(err, result) {
              if (err) {
                log.error(err, 'Error creating metadata doc');
                res.send(500);
              } else {
                res.send(201);
              }
            });
          }
        }
        return next();
      });
    },

    metagroup_read: function (req, res, next) {
      log.debug('metagroup_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(500);
        } else {
          // we have the doc now, let's see if it has the group
          if (result.groups && result.groups[req.params.name]) {
            res.send(200, result.groups[req.params.name]);
          } else {
            res.send(404);
          }
        }
        return next();
      });
    },

    metagroup_updateOrDelete: function (req, res, next) {
      log.debug('metagroup_update: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      // if it's a delete, we set groupid to null
      var groupid = null;
      if (req.method === 'PUT') {
        groupid = JSON.parse(req.body);
        // TODO: check groupid for validity      
      }


      var update = {};
      update['groups.' + req.params.name] = groupid;
      crudHandler.partialUpdate(req._metapair, update, function(err, result) {
        if (err) {
          log.error(err, 'Error updating metadata doc');
          res.send(500);
        } else {
          res.send(200, result);
        }
        return next();
      });
    },

    metaprivate_create: function (req, res, next) {
      log.debug('metaprivate_create: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      // generate a private pair
      getAnonymousPair(req._tokendata.userid, function(err, pair) {
        if (err != null) {
          res.send(500);
        } else {
          crudHandler.getDoc(req._metapair, function (err, result) {
            if (err) {
              log.error(err, 'Error reading metadata doc');
              res.send(500);
            } else {
              // we have the doc now, let's see if it has the group
              if (result.private && result.private[req.params.name]) {
                res.send(400); // duplicate key
              } else {
                var update = {};
                update['private.' + req.params.name] = pair;
                crudHandler.partialUpdate(req._metapair, update, function(err, result) {
                  if (err) {
                    log.error(err, 'Error creating metadata doc');
                    res.send(500);
                  } else {
                    res.send(201);
                  }
                });
              }
            }
          });
        }
        return next();
      });
    },

    metaprivate_read: function (req, res, next) {
      log.debug('metaprivate_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(500);
        } else {
          // we have the doc now, let's see if it has the group
          if (result.private && result.private[req.params.name]) {
            res.send(200, result.private[req.params.name]);
          } else {
            res.send(404);
          }
        }
        return next();
      });
    },

    metaprivate_updateOrDelete: function (req, res, next) {
      log.debug('metaprivate_update: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      res.send(501); // not implemented
      return next();
    },


  };
};
