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
var async = require('async');

var log = require('../log.js')('seagullApi.js');

/*
 Http interface for group-api
 */
module.exports = function (crudHandler, userApiClient, gatekeeperClient, metrics) {

  /*
   HELPERS
   */

  function createDocAndCallback(metaPair, res, next, cb) {
    crudHandler.createDoc(metaPair, {}, function (err, result) {
      if (err) {
        log.error(err, 'Error creating metadata doc');
        if (err.statusCode == 400) {
          res.send(422);
        } else {
          res.send(err.statusCode);
        }
        return next();
      } else {
        cb();
      }
    });
  }

  function stringToBoolean(value) {
    return _.includes(['true', 'yes', 'y', '1'], _.trim(value).toLowerCase());
  }

  function parseUsersQuery(req) {
    var query = {};

    var trustorPermissions = _.trim(req.params.trustorPermissions);
    if (trustorPermissions !== '') {
      query.trustorPermissions = _.compact(_.map(trustorPermissions.split(','), _.trim));
    }
    var trusteePermissions = _.trim(req.params.trusteePermissions);
    if (trusteePermissions !== '') {
      query.trusteePermissions = _.compact(_.map(trusteePermissions.split(','), _.trim));
    }
    var email = _.trim(req.params.email);
    if (email !== '') {
      query.email = new RegExp(_.escapeRegExp(email), 'i');
    }
    var emailVerified = _.trim(req.params.emailVerified);
    if (emailVerified !== '') {
      query.emailVerified = stringToBoolean(emailVerified);
    }
    var termsAccepted = _.trim(req.params.termsAccepted);
    if (termsAccepted !== '') {
      query.termsAccepted = new RegExp(_.escapeRegExp(termsAccepted), 'i');
    }
    var name = _.trim(req.params.name);
    if (name !== '') {
      query.name = new RegExp(_.escapeRegExp(name), 'i');
    }
    var birthday = _.trim(req.params.birthday);
    if (birthday !== '') {
      query.birthday = new RegExp(_.escapeRegExp(birthday), 'i');
    }
    var diagnosisDate = _.trim(req.params.diagnosisDate);
    if (diagnosisDate !== '') {
      query.diagnosisDate = new RegExp(_.escapeRegExp(diagnosisDate), 'i');
    }

    return _.isEmpty(query) ? null : query;
  }

  function userMatchesQueryOnPermissions(user, query) {
    if (query) {
      if (_.has(query, 'trustorPermissions') && !_.every(query.trustorPermissions, _.partial(_.has, user.trustorPermissions))) {
        return false;
      }
      if (_.has(query, 'trusteePermissions') && !_.every(query.trusteePermissions, _.partial(_.has, user.trusteePermissions))) {
        return false;
      }
    }
    return true;
  }

  function userMatchesQueryOnUser(user, query) {
    if (query) {
      if (_.has(query, 'email') && !query.email.test(user.username)) {
        return false;
      }
      if (_.has(query, 'emailVerified') && query.emailVerified != stringToBoolean(user.emailVerified)) {
        return false;
      }
      if (_.has(query, 'termsAccepted') && !query.termsAccepted.test(user.termsAccepted)) {
        return false;
      }
    }
    return true;
  }

  function userMatchesQueryOnProfile(user, query) {
    if (query) {
      if (_.has(query, 'name') && !query.name.test(_.result(user, 'profile.fullName'))) {
        return false;
      }
      if (_.has(query, 'birthday') && !query.birthday.test(_.result(user, 'profile.patient.birthday'))) {
        return false;
      }
      if (_.has(query, 'diagnosisDate') && !query.diagnosisDate.test(_.result(user, 'profile.patient.diagnosisDate'))) {
        return false;
      }
    }
    return true;
  }

  function userMatchingQuery(user, query) {
    if (query) {
      if (!userMatchesQueryOnPermissions(user, query) ||
          !userMatchesQueryOnUser(user, query) ||
          !userMatchesQueryOnProfile(user, query)) {
        return null;
      }
    }
    return user;
  }

  function sanitizeUser(user) {
    return _.omit(user, 'passwordExists');
  }

  return {
    /** HEALTH CHECK **/
    status: function (req, res, next) {
      log.debug('status: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      if (req.params.status) {
        res.send(parseInt(req.params.status));
      } else {
        crudHandler.status(function (error, result) {
          log.debug('returning status ' + result.statusCode);
          res.send(result.statusCode, result.deps);
        });
      }
      return next();
    },

    /*
     IMPLEMENTATIONS OF METHODS
     */

    users: function(req, res, next) {
      var targetUserId = _.trim(req.params.userid);
      if (targetUserId === '') {
        res.send(400, 'Target user id not specified');
        return next();
      }

      var query = parseUsersQuery(req);

      var mergedUserPermissions = {};
      gatekeeperClient.groupsForUser(targetUserId, function(error, trustorUserPermissions) {
        if (error) {
          log.error(error, 'Error getting groups for target user id', targetUserId);
          res.send(error.statusCode || 500);
          return next(false);
        }

        _.forEach(trustorUserPermissions, function(p, u) { mergedUserPermissions[u] = { trustorPermissions: p }; });

        gatekeeperClient.usersInGroup(targetUserId, function(error, trusteeUserPermissions) {
          if (error) {
            log.error(error, 'Error getting users for target user id', targetUserId);
            res.send(error.statusCode || 500);
            return next(false);
          }

          _.forEach(trusteeUserPermissions, function(p, u) { mergedUserPermissions[u] = _.merge(mergedUserPermissions[u] || {}, { trusteePermissions: p }); });

          delete mergedUserPermissions[targetUserId];
          mergedUserPermissions = _.pick(mergedUserPermissions, function(p) { return userMatchesQueryOnPermissions(p, query); });

          async.mapLimit(_.keys(mergedUserPermissions), 5, function(trustorUserId, callback) {
            userApiClient.getUserInfo(trustorUserId, function(error, user) {
              if (error) {
                log.error(error, 'Error getting user for user id', trustorUserId);
                return callback(error);
              } else if (!user) {
                log.error('No user returned for user id', trustorUserId);
                return callback({statusCode: 500});
              }

              if (!userMatchesQueryOnUser(user, query)) {
                return callback();
              }

              user = _.merge(user, mergedUserPermissions[trustorUserId]);

              userApiClient.getMetaPair(trustorUserId, function(error, metaPair) {
                if (error) {
                  if (error.statusCode == 404) {
                    return callback(null, userMatchingQuery(user, query));
                  }
                  log.error(error, 'Error getting meta pair for user id', trustorUserId);
                  return callback(error);
                } else if (!metaPair) {
                  return callback(null, userMatchingQuery(user, query));
                }

                crudHandler.getDoc(metaPair, function(error, document) {
                  if (error) {
                    if (error.statusCode == 404) {
                      return callback(null, userMatchingQuery(user, query));
                    }
                    log.error(error, 'Error getting document for meta pair', metaPair);
                    return callback(error);
                  }

                  user.profile = _.result(document, 'detail.profile');

                  if (_.isEmpty(user.trustorPermissions)) {
                    delete user.profile.patient;
                  }

                  return callback(null, userMatchingQuery(user, query));
                });
              });
            });
          }, function(error, users) {
            if (req._tokendata.isserver) {
              metrics.postServer('query users', {params: req.params, error: error}, req._sessionToken, function(){});
            } else {
              metrics.postThisUser('query users', {params: req.params, error: error}, req._sessionToken, function(){});
            }

            if (error) {
              res.send(error.statusCode || 500);
              return next(false);
            }

            users = _.compact(users);
            if (!req._tokendata.isserver) {
              users = _.map(users, sanitizeUser);
            }

            res.send(200, users);
            return next();
          });
        });
      });
    },

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

      metrics.postThisUser('collectionRead', {coll: collection}, req._sessionToken, function(){});

      crudHandler.getDoc(req._metapair, function (err, result) {
        if (err) {
          log.error(err, 'Error reading metadata doc');
          res.send(err.statusCode);
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

      metrics.postThisUser('collection update', {coll: collection},
        req._sessionToken, function(){});

      updates = _.reduce(updates, function (accum, update, key) {
        accum[util.format('%s.%s', collection, key)] = update;
        return accum;
      }, {});

      function doUpdate(addIfNotThere) {
        var metaPair = req._metapair;
        crudHandler.partialUpdate(metaPair, updates, function (err, result) {
          if (err) {
            if (err.statusCode == 404 && addIfNotThere) {
              return createDocAndCallback(metaPair, res, next, function () { doUpdate(false); });
            } else {
              log.error(err, 'Error updating metadata doc');
              res.send(err.statusCode);
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

    metaprivate_read: function (req, res, next) {
      log.debug('metaprivate_read: params[%j], url[%s], method[%s]', req.params, req.url, req.method);
      // this is the pair that applies to the metadata as a whole, not the private pair
      // we are returning from this function
      var metaPair = req._metapair;

      var name = req.params.name;
      if (name == null) {
        res.send(400, 'No name specified');
        return next();
      }

      metrics.postServer('private read', {pair: name}, req._sessionToken, function(){});

      function getPrivatePair(addIfNotThere) {
        crudHandler.getDoc(metaPair, function (err, mongoResult) {
          if (err) {
            if (err.statusCode === 404 && addIfNotThere) {
              return createDocAndCallback(metaPair, res, next, function () { getPrivatePair(addIfNotThere); });
            }
            log.error(err, 'Error reading metadata doc');
            res.send(err.statusCode);
          } else {
            var result = mongoResult.detail;
            // we have the doc now, let's see if it has the name
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
        // TODO: 20150627_darinkrauss This probably shouldn't be anon (including name)
        userApiClient.getAnonymousPair(function (err, pair) {
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
                if (err.statusCode == 404) {
                  res.send(404);
                  return next();
                } else {
                  res.send(err.statusCode);
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
