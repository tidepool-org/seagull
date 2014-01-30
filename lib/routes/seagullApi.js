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
module.exports = function (crudHandler) {

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

/*

    addGroup: function (req, res, next) {
      log.debug('addGroup: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var group = req.params.group;

      if (groupIsValid(group)) {

        crudHandler.createGroup(group, function (error, id) {
          if (error) {
            log.error(error, 'Error saving group[%j]', group);
            res.send(500);
          }
          else {
            res.send(201, {id: id});
          }
        });
      }
      else {
        res.send(400);
      }

      return next();
    },

    memberOf: function (req, res, next) {
      log.debug('memberOf: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var userId = req.params.userid;

      if (userId) {
        crudHandler.findGroupsMemberOf(userId, function (error, groups) {
          if (error) {
            log.error(error, 'Error getting groups user[%s] is a member of', userId);
            res.send(500);
          }
          else {
            if (groups.length > 0) {
              res.send(200, {groups: groups});
            }
            else {
              res.send(204);
            }
          }
        });
      }
      else {
        res.send(400);
      }

      return next();
    },

    addToGroup: function (req, res, next) {
      log.debug('addToGroup: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var groupId = req.params.groupid;
      var userId = req.params.userid;

      if (groupId && userId) {
        crudHandler.addUserToGroup(
          groupId,
          userId,
          function (error, group) {
            if (error) {
              log.warn(error, 'Error adding user[%s] to the group[%s]', userId, groupId);
              res.send(500);
            }
            else {
              if (groupIsValid(group)) {
                res.send(200, {group: group});
              }
              else {
                res.send(204);
              }
            }
            next();
          }
        );
      }
      else {
        res.send(400);
        return next();
      }
    },

    removeFromGroup: function (req, res, next) {
      log.debug('removeFromGroup: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var groupId = req.params.groupid;
      var userId = req.params.userid;

      if (groupId && userId) {
        crudHandler.removeUserFromGroup(
          groupId,
          userId,
          function (error, group) {
            if (error) {
              log.warn(error, 'Error removing user[%s] from group[%s]', userId, groupId);
              res.send(500);
            }
            else {
              if (groupIsValid(group)) {
                res.send(200, {group: group});
              }
              else {
                res.send(204);
              }
            }
            next();
          }
        );
      }
      else {
        res.send(400);
        return next();
      }
    },

    getGroup: function (req, res, next) {
      log.debug('getGroup: params[%j], url[%s], method[%s]', req.params, req.url, req.method);

      var groupId = req.params.groupid;

      if (groupId) {
        crudHandler.findGroup(groupId, function (error, group) {
          if (error) {
            log.warn(error, 'Error finding group[%s]', groupId);
            res.send(500);
          }
          else {
            if (groupIsValid(group)) {
              res.send(200, {group: group});
            }
            else {
              res.send(204);
            }
          }
          next();
        });
      }
      else {
        res.send(400);
      }

      return next();
    },

    getMembers: function (req, res, next) {
      var groupId = req.params.groupid;

      if (groupId) {
        crudHandler.findGroup(groupId, function (error, group) {
          if (error) {
            log.warn(error, 'Problem looking up group[%s]', groupId);
            res.send(500);
          }
          else {
            if (groupIsValid(group)) {
              res.send(200, { members: group.members });
            }
            else {
              res.send(204);
            }
          }
          next();
        });
      }
      else {
        res.send(400);
        return next();
      }
    }
    */
  };
};
