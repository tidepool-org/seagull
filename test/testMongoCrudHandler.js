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

// expect violates this jshint thing a lot, so we just suppress it
/* jshint expr: true */

'use strict';

var expect = require('salinity').expect;
// expect violates this jshint thing a lot, so we just suppress it
/* jshint expr: true */

var metadb = require('../lib/mongoCrudHandler.js')({
  mongoConnectionString: 'mongodb://localhost/seagull_test',
  // the special config value we pass for testing will enable us to wipe the database
  _wipeTheEntireDatabase: true,
  adminKey: 'specialkey',
  logger: {
    error: console.log,
    warn: console.log,
    info: console.log
  }
});

function shouldSucceed(err, result, code) {
  if (err) {
    console.log('Got err when expecting null.', err);
  }
  expect(err).to.not.exist;
  expect(result).to.exist;
  expect(result.statusCode).to.equal(code);
}

function shouldFail(err, result, code) {
  if (result) {
    console.log('Got result when expecting null', result);
  }
  expect(err).to.have.property('statusCode');
  expect(err.statusCode).to.equal(code);
  expect(result).to.not.exist;
  expect(err).to.exist;
  expect(err.message).to.exist;
}

describe('metadb:', function () {
  describe('db_metadata_mongo basics', function () {
    it('should have an app', function () {
      expect(metadb).to.exist;
    });
    it('should have status method', function () {
      expect(metadb).to.respondTo('status');
    });
    it('should have createDoc method', function () {
      expect(metadb).to.respondTo('createDoc');
    });
    it('should have getDoc method', function () {
      expect(metadb).to.respondTo('getDoc');
    });
    it('should have partialUpdate method', function () {
      expect(metadb).to.respondTo('partialUpdate');
    });
  });

  describe('db_metadata_mongo', function () {

    /* global before */
    before(function (done) {
      expect(metadb).to.respondTo('_wipeTheEntireDatabase');
      metadb._wipeTheEntireDatabase(done);
    });

    after(function () {
      metadb.closeDatabase();
    });

    var userId1 = '6fad283648';
    var userId2 = '36486fad28';
    var metatest1 = {
      name: 'Testy',
      bio: 'Awesome is my game.'
    };
    var metatest2 = {
      shortname: 'Boo',
      bio: 'Haunting is my game.'
    };

    it('should have a good status return', function (done) {
      metadb.status(function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.running).to.be.true;
        expect(result.deps.down).to.be.empty;
        done();
      });
    });

    describe('encryption', function() {
      var plaintext = 'this is a string to encrypt';
      var plainobject = {
        mol: 42,
        pi: 3.1415,
        quote: 'What we anticipate seldom occurs; what we least expect generally happens.',
        array: [1,2,3,4],
        object: {ion: 'overruled'}
      };
      var crypttext = null;

      it('should be able to encrypt a string', function(done) {
        crypttext = metadb._encrypt_value(plaintext);
        expect(crypttext).to.exist;
        expect(crypttext).to.match(/[^ ]+/);
        done();
      });

      it('should be able to decrypt a string', function(done) {
        var s = metadb._decrypt_value(crypttext);
        expect(s).to.exist;
        expect(s).to.equal(plaintext);
        done();
      });

      it('should be able to encrypt an object', function(done) {
        crypttext = metadb._encrypt_value(plainobject);
        expect(crypttext).to.exist;
        expect(crypttext).to.match(/[^ ]+/);
        done();
      });

      it('should be able to decrypt an object', function(done) {
        var s = metadb._decrypt_value(crypttext);
        expect(s).to.exist;
        expect(s).to.deep.equal(plainobject);
        done();
      });

    });

    it('should create a metadata object', function (done) {
      metadb.createDoc(userId1, metatest1, function (err, result) {
        shouldSucceed(err, result, 201);
        expect(result.detail).to.deep.equal(metatest1);
        done();
      });
    });

    it('should fail trying to recreate existing object', function (done) {
      metadb.createDoc(userId1, metatest1, function (err, result) {
        shouldFail(err, result, 400);
        done();
      });
    });

    it('should create a second object', function (done) {
      metadb.createDoc(userId2, metatest2, function (err, result) {
        shouldSucceed(err, result, 201);
        expect(result.detail).to.deep.equal(metatest2);
        done();
      });
    });

    it('should be able to fetch an object', function (done) {
      metadb.getDoc(userId1, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail).to.deep.equal(metatest1);
        done();
      });
    });

    it('should fail to fetch from a bad user id', function (done) {
      metadb.getDoc('1234', function (err, result) {
        shouldFail(err, result, 404);
        done();
      });
    });

    it('should be able to fetch the other object', function (done) {
      metadb.getDoc(userId2, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail).to.deep.equal(metatest2);
        done();
      });
    });

    it('should be able to modify a field', function (done) {
      var newname = 'BooBoo';
      var updates = { shortname: newname };
      metadb.partialUpdate(userId2, updates, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.shortname).to.equal(newname);
        metatest2.shortname = newname;
        done();
      });
    });

    it('should be able to create a new field', function (done) {
      var name = 'Grizzly';
      var updates = { name: name };
      metadb.partialUpdate(userId2, updates, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.name).to.equal(name);
        metatest2.name = name;
        done();
      });
    });

    it('should be able to create a new subdocument field', function (done) {
      var item1 = 'picnic basket';
      var updates = { 'likes.item1': item1 };
      metadb.partialUpdate(userId2, updates, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.likes.item1).to.equal(item1);
        metatest2.likes = { item1: item1 };
        done();
      });
    });

    it('should be able to do multiple updates', function (done) {
      var item2 = 'sandwiches';
      var bio = 'Yogi, get out of here!';
      var updates = { 'likes.item2': item2, bio: bio };
      metadb.partialUpdate(userId2, updates, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.likes.item2).to.equal(item2);
        expect(result.detail.bio).to.equal(bio);
        metatest2.likes.item2 = item2;
        metatest2.bio = bio;
        done();
      });
    });

    it('should still be able to fetch the other object', function (done) {
      metadb.getDoc(userId2, function (err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail).to.deep.equal(metatest2);
        done();
      });
    });
  });
});
