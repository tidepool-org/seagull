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

'use strict';

var _ = require('lodash');
var mongojs = require('mongojs');
var pre = require('amoeba').pre;

// The init function takes a configuration object.
// Config values supported are:
//  mongoConnectionString -- a url-style string for mongo connect
//  logger -- a log system -- expected to have info, error, warn methods
//  adminKey -- a key that can be used as a superuser key for managing records instead of the
//      user's password
//  _wipeTheEntireDatabase -- if this is truthy, it will cause the init routine to return a function
//      of the same name; this exists for testing and should not be used on a production database!
module.exports = function init(config) {
  var log = config.logger || require('./log.js')('mongoCrudHandler.js');

  pre.hasProperty(config, 'mongoConnectionString');
  pre.defaultProperty(config, '_wipeTheEntireDatabase', false);


  var _status = { running: false, deps: { up: [], down: [] } };

  var db = mongojs(config.mongoConnectionString, ['seagull'], function (err) {
    log.error(err, 'error opening mongo');
    _status.deps.up = _.without(_status.deps.up, 'mongo');
    _status.deps.down = _.union(_status.deps.down, ['mongo']);
    return ourexports;
  });

  db.seagull.ensureIndex({userId: 1}, {unique: true});

  _status.deps.down = _.without(_status.deps.down, 'mongo');
  _status.deps.up = _.union(_status.deps.up, ['mongo']);

  var ourexports = {
    closeDatabase: closeDatabase,
    status: serverStatus,
    createDoc: createDoc,
    getDoc: getDoc,
    partialUpdate: partialUpdate
  };

  // we'll only allow wipe if the connection string contains test
  if (config._wipeTheEntireDatabase && config.mongoConnectionString.match(/test/)) {
    ourexports._wipeTheEntireDatabase = _wipeTheEntireDatabase;
    ourexports._encrypt_value = _encrypt_value;
    ourexports._decrypt_value = _decrypt_value;
  }

  function _encrypt_value(value) {
    return JSON.stringify(value);
  }

  function _decrypt_value(value) {
    return JSON.parse(value);
  }

  function _cleanupData(dataobj) {
    var clone = _.cloneDeep(dataobj);
    delete clone._id;
    delete clone.userId;
    delete clone.private;
    delete clone.groups;
    return clone;
  }

  function createDoc(userId, value, done) {
    var crypted = _encrypt_value(value);
    db.seagull.insert({userId: userId, value: crypted}, {w: 1}, function (err, result) {
      if (err) {
        if (err.code == 11000) {    // this is a mongo error for duplicate key
          done({statusCode: 400, message: 'duplicate key', detail: err}, null);
        } else {
          done(err, null);
        }
      } else {
        // do we want to do something with result here?
        done(null, {statusCode: 201, message: 'created', detail: _cleanupData(value)});
      }
    });
  }

  function getDoc(userId, done) {
    db.seagull.findOne({userId: userId}, {value: 1}, function (err, result) {
      if (err || (result === null)) {
        done({statusCode: 404, message: 'not found', detail: err}, null);
      } else {
        var decrypted = _decrypt_value(result.value);
        if (decrypted) {
          done(null, {statusCode: 200, message: 'found', detail: decrypted});
        } else {
          done({statusCode: 401, message: 'not authorized', detail: null}, null);
        }
      }
    });
  }

  function _updateDoc(userId, value, done) {
    // updates document to have new value for whole doc, returns new value
    // This is a private function only for use by this module.
    var crypted = _encrypt_value(value);
    db.seagull.update({userId: userId}, {$set: {value: crypted}}, {w: 1}, function (err, result) {
      if (err) {
        done({statusCode: 500, message: 'server error', detail: err}, null);
      } else {
        done(null, {statusCode: 200, message: 'created', detail: value});
      }
    });
  }

  function _apply_updates(item, updates) {
    // helper function to recursively set values specified in updates
    function setValue(key, val, obj) {
      var keys = key.split('.');
      if (keys.length < 2) {
        // no dots so just set the value
        obj[keys[0]] = val;
      } else {
        if (!obj[keys[0]]) {
          obj[keys[0]] = {};
        }  // create an object if we need one to go down a level
        obj = obj[keys.shift()];
        setValue(keys.join('.'), val, obj);
      }
    }

    // iterate over the fields and delete them if requested
    _.each(updates, function (value, key) {
      if (value === null) {
        delete item[key];
      } else {
        setValue(key, value, item);
      }
    });


  }

  function partialUpdate(userId, updates, done) {
    // updates a document; updates is an object, where the keys are used to index into the document
    // using dot notation. Assigning a value of null deletes the key.
    // Assigning a nonexistent value works by creating the elements necessary.
    // Document must already exist.

    // start by retrieving the document
    getDoc(userId, function (err, result) {
      if (err) {
        done(err, null);
      } else {
        // got it, now let's operate on it
        // this call modifies data in place
        var clone = _.cloneDeep(result.detail);
        _apply_updates(clone, updates);
        _updateDoc(userId, clone, function (err2, result2) {
          if (err2) {
            done(err2, null);
          } else {
            done(null, _cleanupData(result2));
          }
        });
      }
    });
  }

  // this is a special function that is used in testing
  function _wipeTheEntireDatabase(done) {
    db.getCollectionNames(function (err, result) {
      if (err) {
        log.error('getCollectionNames failed');
        done(err, null);
      } else {
        if (result.length !== 0) {
          db.seagull.drop(function(err) {
            if (err) {
              done(err);
            } else {
              db.seagull.ensureIndex({userId: 1}, {unique: true}, done);
            }
          });
        }
        else {
          done();
        }
      }
    });
  }

  function serverStatus(done) {
    _status.running = (_status.deps.down.length === 0);
    _status.statusCode = _status.running ? 200 : 500;
    done(null, _status);
  }

  function closeDatabase() {
    db.close();
  }

  return ourexports;
};
