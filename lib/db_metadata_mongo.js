// db_mongo.js
// -----------
// module to provide access to a database for metadata
// this one uses mongo

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

// This is how you make a module loadable by node as well as require.
if (typeof define !== 'function') {
  /* jshint -W079 */
  var define = require('amdefine')(module);
  /* jshint +W079 */
}

// And now we define our dependencies and give them names
define(['lodash', 'mongojs', 'crypto-js'], function(_,  mongojs, crypto) {
  // These are our internal state variables
  var db;
  var cfg;
  var _status = { running: false, deps: { up: [], down: [] } };
  var log;
  // define the encryption algorithm in one place
  // crypto offers many options; lacking any real preference, this seems good enough
  var encryption_algorithm = crypto.AES;

  function create_secret_key(pair) {
    var hash = crypto.algo.SHA256.create();
    hash.update(pair.hash);
    hash.update(cfg.saltDeploy);
    return hash.finalize().toString();
  }

  function _encrypt_value(pair, value) {
    var p = create_secret_key(pair);
    var v = JSON.stringify(value);
    var encoded = '' + encryption_algorithm.encrypt(v, p);
    return encoded;
  }

  function _decrypt_value(pair, value) {
    var d = encryption_algorithm.decrypt(value, create_secret_key(pair));
    var x = null;
    try {
      var r = d.toString(crypto.enc.Utf8);
    } catch(e) {
      // if the decrypt fails this will throw, so we can just return nothing and move on
      r = null;
    }
    if (r) {
      return JSON.parse(r);
    } else {
      return null;
    }
  }

  function _cleanupData(dataobj) {
    var clone = _.cloneDeep(dataobj);
    delete clone._id;
    return clone;
  }

  function createDoc(pair, value, done) {
    // encrypts value with pair.hash+salt, stores it under key of pair.id; error if it already exists
    var crypted = _encrypt_value(pair, value);
    db.seagull.insert({_id: pair.id, value: crypted}, {w:1}, function(err, result) {
      if (err) {
        if (err.code==11000) {    // this is a mongo error for duplicate key
          done({statuscode: 400, message: 'duplicate key', detail: err}, null);
        } else {
          done(err, null);
        }
      } else {
        // do we want to do something with result here?
        done(null, {statuscode: 201, message: 'created', detail: _cleanupData(value)});
      }
    });
  }

  function getDoc(pair, done) {
    // fetches document at pair.id, decrypts and returns it
    db.seagull.findOne({_id: pair.id}, {value:1}, function(err, result) {
      if (err || (result===null)) {
        done({statuscode: 404, message: 'not found', detail: err}, null);
      } else {
        var decrypted = _decrypt_value(pair, result.value);
        if (decrypted) {
          done(null, {statuscode: 200, message: 'found', detail: decrypted});
        } else {
          done({statuscode: 401, message: 'not authorized', detail: null}, null);
        }
      }
    });
  }

  function _updateDoc(pair, value, done) {
    // updates document to have new value for whole doc, returns new value
    // This is a private function only for use by this module.
    var crypted = _encrypt_value(pair, value);
    db.seagull.update({_id: pair.id}, {value: crypted}, {w:1}, function(err, result) {
      if (err) {
        done({statuscode: 400, message: 'duplicate key', detail: err}, null);
      } else {
        done(null, {statuscode: 200, message: 'created', detail: value});
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
        if (!obj[keys[0]]) obj[keys[0]] = {};  // create an object if we need one to go down a level
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

  function partialUpdate(pair, updates, done) {
    // updates a document; updates is an object, where the keys are used to index into the document
    // using dot notation. Assigning a value of null deletes the key.
    // Assigning a nonexistent value works by creating the elements necessary.
    // Document must already exist. 

    // start by retrieving the document
    getDoc(pair, function(err, result) {
      if (err) {
        done(err, null);
      } else {
        // got it, now let's operate on it
        // this call modifies data in place
        var clone = _.cloneDeep(result.detail);
        _apply_updates(clone, updates);
        _updateDoc(pair, clone, function(err2, result2) {
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
    db.collectionNames('seagull', function(err, result) {
      if (err) {
        log.error('collectionNames failed');
        done(err, null);
      } else {
        if (result.length !== 0) {
          db.seagull.drop(done);
        } else {
          done();
        }
      }
    });
  }

  function status(done) {
    _status.running = (_status.deps.down.length === 0);
    _status.statuscode = _status.running ? 200 : 500;
    done(null, _status);
  }

  var ourexports = {
    status: status,
    createDoc: createDoc,
    getDoc: getDoc,
    partialUpdate: partialUpdate
  };


  // The init function takes a configuration object.
  // Config values supported are:
  //  mongoConnectionString -- a url-style string for mongo connect
  //  logger -- a log system -- expected to have info, error, warn methods 
  //  saltDeploy -- a salt value set in the deploy variables; this provides an additional
  //      layer of secret that must be known to decrypt the data if the database files were to leak.
  //  adminKey -- a key that can be used as a superuser key for managing records instead of the 
  //      user's password
  //  _wipeTheEntireDatabase -- if this is truthy, it will cause the init routine to return a function
  //      of the same name; this exists for testing and should not be used on a production database!
  function init(config) {
    log = config.logger;

    if (!config.saltDeploy) {
      throw 'A deploy salt MUST be specified!';
    }

    if (_status.running) {
      var msg = 'db_mongo init function called more than once!';
      log.warn(msg);
      return ourexports;
    }

    cfg = _.clone(config);
    db = mongojs(cfg.mongoConnectionString, ['seagull'], function(err) {
      log.error('error opening mongo');
      _status.deps.up = _.without(_status.deps.up, 'mongo');
      _status.deps.down = _.union(_status.deps.down, ['mongo']);
      return ourexports;
    });

    _status.deps.down = _.without(_status.deps.down, 'mongo');
    _status.deps.up = _.union(_status.deps.up, ['mongo']);

    // we'll only allow wipe if the connection string contains test
    if (cfg._wipeTheEntireDatabase && cfg.mongoConnectionString.match(/test/)) {
      ourexports._wipeTheEntireDatabase = _wipeTheEntireDatabase;
      ourexports._encrypt_value = _encrypt_value;
      ourexports._decrypt_value = _decrypt_value;
    }
    return ourexports;
  }

  // this is our constructor function
  return init;
});
