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

const util = require('util');

const _ = require('lodash');
const async = require('async');

const log = require('../log.js')('seagullApi.js');

/*
 Http interface for group-api
 */
module.exports = function (crudHandler, userApiClient, gatekeeperClient, metrics) {

  /*
   HELPERS
   */

  function createDocAndCallback(userId, res, next, cb) {
    crudHandler.createDoc(userId, {}, function (err, result) {
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

  function getCollection(req, res, sanitize, next) {
    crudHandler.getDoc(_.get(req, 'params.userid'), function (err, result) {
      if (err) {
        log.error(err, 'Error reading metadata doc');
        res.send(err.statusCode);
      } else {
        var collection = _.get(req, 'params.collection');
        var retVal = result.detail[collection];
        if (retVal == null) {
          res.send(404);
        } else {
          if (collection === 'profile' && sanitize) {
            res.send(200, sanitizeProfile(retVal));
          } else {
            res.send(200, retVal);
          }
        }
      }
      return next();
    });
  }

  var ANY = ['any'];
  var NONE = ['none'];
  var TRUES = ['true', 'yes', 'y', '1'];

  function parsePermissions(permissions) {
    permissions = _.trim(permissions);
    if (permissions !== '') {
      permissions = _.compact(_.map(permissions.split(','), _.trim));
      if (_.isEqual(permissions, ANY)) {
        return ANY;
      } else if (_.isEqual(permissions, NONE)) {
        return NONE;
      } else if (!_.isEmpty(permissions)) {
        return permissions;
      }
    }
    return null;
  }

  function arePermissionsValid(permissions) {
    if (permissions.length > 1) {
      if (!_.isEmpty(_.intersection(_.union(ANY, NONE), permissions))) {
        return false;
      }
    }
    return true;
  }

  function arePermissionsSatisfied(queryPermissions, userPermissions) {
    if (queryPermissions === ANY) {
      return !_.isEmpty(userPermissions);
    } else if (queryPermissions === NONE) {
      return _.isEmpty(userPermissions);
    } else {
      return _.every(queryPermissions, _.partial(_.has, userPermissions));
    }
  }

  function stringToBoolean(value) {
    return _.includes(TRUES, _.trim(value).toLowerCase());
  }

  function parseUsersQuery(req) {
    var query = {};

    var trustorPermissions = parsePermissions(req.query.trustorPermissions);
    if (trustorPermissions) {
      query.trustorPermissions = trustorPermissions;
    }
    var trusteePermissions = parsePermissions(req.query.trusteePermissions);
    if (trusteePermissions) {
      query.trusteePermissions = trusteePermissions;
    }
    var email = _.trim(req.query.email);
    if (email !== '') {
      query.email = new RegExp(_.escapeRegExp(email), 'i');
    }
    var emailVerified = _.trim(req.query.emailVerified);
    if (emailVerified !== '') {
      query.emailVerified = stringToBoolean(emailVerified);
    }
    var termsAccepted = _.trim(req.query.termsAccepted);
    if (termsAccepted !== '') {
      query.termsAccepted = new RegExp(_.escapeRegExp(termsAccepted), 'i');
    }
    var name = _.trim(req.query.name);
    if (name !== '') {
      query.name = new RegExp(_.escapeRegExp(name), 'i');
    }
    var birthday = _.trim(req.query.birthday);
    if (birthday !== '') {
      query.birthday = new RegExp(_.escapeRegExp(birthday), 'i');
    }
    var diagnosisDate = _.trim(req.query.diagnosisDate);
    if (diagnosisDate !== '') {
      query.diagnosisDate = new RegExp(_.escapeRegExp(diagnosisDate), 'i');
    }

    return _.isEmpty(query) ? null : query;
  }

  function isUsersQueryValid(query) {
    if (query) {
      if (_.has(query, 'trustorPermissions') && !arePermissionsValid(query.trustorPermissions)) {
        return false;
      }
      if (_.has(query, 'trusteePermissions') && !arePermissionsValid(query.trusteePermissions)) {
        return false;
      }
    }
    return true;
  }

  function userMatchesQueryOnPermissions(user, query) {
    if (query) {
      if (_.has(query, 'trustorPermissions') && !arePermissionsSatisfied(query.trustorPermissions, user.trustorPermissions)) {
        return false;
      }
      if (_.has(query, 'trusteePermissions') && !arePermissionsSatisfied(query.trusteePermissions, user.trusteePermissions)) {
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

  function sanitizeProfile(profile) {
    return _.pick(profile, 'fullName');
  }

  return {
    /** HEALTH CHECK **/
    status: function (req, res, next) {
      log.trace('status: params[%j], url[%s], method[%s]', req.query, req.url, req.method);

      if (req.query.status) {
        res.send(parseInt(req.query.status));
      } else {
        crudHandler.status(function (error, result) {
          log.trace('returning status ' + result.statusCode);
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
        log.error('Target user id not specified');
        res.send(400, 'Target user id not specified');
        return next(false);
      }

      var query = parseUsersQuery(req);
      if (!isUsersQueryValid(query)) {
        log.error('Query is invalid', query);
        res.send(400, 'Query is invalid');
        return next(false);
      }

      var mergedUserPermissions = {};
      gatekeeperClient.groupsForUser(targetUserId, function(error, trustorUserPermissions) {
        if (error) {
          log.error(error, 'Error getting groups for target user id', targetUserId);
          res.send(error.statusCode || 500);
          return next(false);
        }

        _.forEach(trustorUserPermissions, function(p, u) { mergedUserPermissions[u] = { trustorPermissions: p }; });

        gatekeeperClient.usersInGroup(targetUserId, async function(error, trusteeUserPermissions) {
          if (error) {
            log.error(error, 'Error getting users for target user id', targetUserId);
            res.send(error.statusCode || 500);
            return next(false);
          }

          _.forEach(trusteeUserPermissions, function(p, u) { mergedUserPermissions[u] = _.merge(mergedUserPermissions[u] || {}, { trusteePermissions: p }); });

          delete mergedUserPermissions[targetUserId];
          mergedUserPermissions = _.pickBy(mergedUserPermissions, function(p) { return userMatchesQueryOnPermissions(p, query); });
          var userProfiles = [];

          const mapLimit = util.promisify(async.mapLimit);
          try {
            const userIds = _.keys(mergedUserPermissions);
            // Break requests for users into chunks of 200, so that the query parameter doesn't get too long
            const results = await mapLimit(_.chunk(userIds, 200), 5, async usersChunk => {
              const getUsers = util.promisify(userApiClient.getUsersWithIds);
              try {
                const users = await getUsers(usersChunk);
                if (!users) {
                  throw new Error(`No users returned for user id ${targetUserId}`);
                } else {
                  return users;
                }
              } catch (error) {
                throw new Error(`Error getting users: ${error}`);
              }
            });
            userProfiles = _.flatten(results);

            if (userProfiles.length !== userIds.length) {
              throw new Error('Received different number of results than we queried for');
            }
          } catch (error) {
            res.send(500);
            return next(false);
          }

          async.mapLimit(userProfiles, 20, function(user, callback) {
            const trustorUserId = user.userid;

            if (!userMatchesQueryOnUser(user, query)) {
              return callback();
            }

            user = _.merge(user, mergedUserPermissions[trustorUserId]);

            crudHandler.getDoc(trustorUserId, function(error, document) {
              if (error) {
                if (error.statusCode == 404) {
                  return callback(null, userMatchingQuery(user, query));
                }
                log.error(error, 'Error getting document for user id', trustorUserId);
                return callback(error);
              }

              user.profile = _.result(document, 'detail.profile');

              if (_.isEmpty(user.trustorPermissions)) {
                if (user.profile) {
                  delete user.profile.patient;
                } else {
                  log.error(`User ${user.userid} does not have a valid profile. Consider investigating the account.`);
                }
              } else {
                if (
                  user.trustorPermissions.custodian ||
                  user.trustorPermissions.view ||
                  user.trustorPermissions.upload) {
                  var settings = _.result(document, 'detail.settings');
                  if (!_.isEmpty(settings)) {
                    user.settings = settings;
                  }
                }
                if (user.trustorPermissions.custodian) {
                  var preferences = _.result(document, 'detail.preferences');
                  if (!_.isEmpty(preferences)) {
                    user.preferences = preferences;
                  }
                }
              }
              return callback(null, userMatchingQuery(user, query));
            });
          }, function(error, users) {
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

      if (req._tokendata.isserver) {
        var sanitize = false;
        return getCollection(req, res, sanitize, next);
      }

      gatekeeperClient.groupsForUser(req._tokendata.userid, function(error, trustorUserPermissions) {
        if (error) {
          log.error(error, 'Error getting groups for authenticated user id', req._tokendata.userid);
          res.send(error.statusCode || 500);
          return next(false);
        }

        // Check to see if the user has trustor permissions for the requested user ID
        var hasTrustorPermissions = _.has(trustorUserPermissions, req.params.userid);

        if (hasTrustorPermissions || collection === 'profile') {
          var sanitize = !hasTrustorPermissions;
          return getCollection(req, res, sanitize, next);
        } else {
          res.send(401, 'Unauthorized');
          return next();
        }
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
        var userId = req.params.userid;
        crudHandler.partialUpdate(userId, updates, function (err, result) {
          if (err) {
            if (err.statusCode == 404 && addIfNotThere) {
              return createDocAndCallback(userId, res, next, function () { doUpdate(false); });
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

      var userId = req.params.userid;

      var name = req.params.name;
      if (name == null) {
        res.send(400, 'No name specified');
        return next();
      }

      function getPrivatePair(addIfNotThere) {
        crudHandler.getDoc(userId, function (err, mongoResult) {
          if (err) {
            if (err.statusCode === 404 && addIfNotThere) {
              return createDocAndCallback(userId, res, next, function () { getPrivatePair(addIfNotThere); });
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
            crudHandler.partialUpdate(userId, update, function (err, result) {
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
    },

    close: function () {
      crudHandler.closeDatabase();
    }
  };
};
