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

var _ = require('lodash');
var salinity = require('salinity');

var expect = salinity.expect;
var sinon = salinity.sinon;
var mockableObject = salinity.mockableObject;

var sessionTokenHeader = 'x-tidepool-session-token';

var env = {
  httpPort: 21000,
  mongoConnectionString: 'mongodb://localhost/test_seagull',
  // the special config value we pass for testing will enable us to wipe the database
  _wipeTheEntireDatabase: true,
  saltDeploy: 'randomsaltvalue',
  logger: { error: console.log, warn: console.log, info: console.log }
};

var userApiClient = mockableObject.make('checkToken', 'getMetaPair', 'getAnonymousPair', 'getUserInfo');

var dbmongo = require('../lib/mongoCrudHandler.js')(env);
var seagull = require('../lib/seagullService.js')(dbmongo, userApiClient, env);
var supertest = require('supertest')('http://localhost:' + env.httpPort);

describe('seagull', function () {

  before(function (done) {
    dbmongo._wipeTheEntireDatabase(function (err) {
      if (err != null) {
        throw err;
      }
      seagull.start(done);
    });
  });

  after(function () {
    seagull.close();
  });

  beforeEach(function () {
    mockableObject.reset(userApiClient);
  });

  it('/status should respond with 200', function (done) {
    supertest
      .get('/status')
      .expect(200)
      .end(
      function (err, obj) {
        if (err) {
          return done(err);
        }
        expect(err).to.not.exist;
        expect(obj.res.body.down).to.eql([]);
        expect(obj.res.body.up).to.eql(['mongo']);
        done();
      });
  });

  // GET /collections -- returns all the valid collection names

  it('GET /collections should respond with 200', function (done) {
    supertest
      .get('/collections')
      .expect(200)
      .end(
      function (err, obj) {
        if (err) {
          return done(err);
        }
        expect(err).to.not.exist;
        expect(obj.res.body).deep.equals(['profile', 'groups', 'private']);
        done();
      });
  });

  var defaultUser = {userid: 'billy' };
  var defaultMetaPair = { name: 'meta', id: 'metaId', 'hash': 'abcd' };

  function setupTokenAndMeta(user, metaPair) {
    user = user || defaultUser;
    metaPair = metaPair || defaultMetaPair;
    sinon.stub(userApiClient, 'checkToken').callsArgWith(1, null, user);
    sinon.stub(userApiClient, 'getMetaPair').callsArgWith(1, null, metaPair);
  }

  function expectTokenAndMeta(token, user, metaPair) {
    user = user || defaultUser;
    metaPair = metaPair || defaultMetaPair;
    expect(userApiClient.checkToken).to.have.been.calledOnce;
    expect(userApiClient.checkToken).to.have.been.calledWith(token, sinon.match.func);
    expect(userApiClient.getMetaPair).to.have.been.calledOnce;
    expect(userApiClient.getMetaPair).to.have.been.calledWith(user.userid, sinon.match.func);
  }

  describe('/:userid/private/:name', function () {
    var pair1 = { name: '', id: 'will', hash: 'a' };

    var sally = { userid: 'sally', isserver: true };

    it('GET should create all required objects if they don\'t exist', function (done) {
      setupTokenAndMeta(sally);
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(1, null, pair1);
      supertest
        .get('/sally/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectTokenAndMeta('howdy', sally);
          expect(userApiClient.getAnonymousPair).to.have.been.calledOnce;
          expect(userApiClient.getAnonymousPair).to.have.been.calledWith(sally.userid, sinon.match.func);
          done();
        });
    });

    it('GET should create just the pair if it doesn\'t exist', function (done) {
      setupTokenAndMeta(sally);
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(1, null, pair1);
      supertest
        .get('/sally/private/clamshell')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectTokenAndMeta('howdy', sally);
          expect(userApiClient.getAnonymousPair).to.have.been.calledOnce;
          expect(userApiClient.getAnonymousPair).to.have.been.calledWith(sally.userid, sinon.match.func);
          done();
        });
    });

    it('GET should get the pair if it already exists', function (done) {
      setupTokenAndMeta(sally);
      supertest
        .get('/sally/private/clamshell')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectTokenAndMeta('howdy', sally);
          done();
        });
    });

    it('DELETE should return 501 because it doesn\'t work yet', function (done) {
      setupTokenAndMeta(sally);
      supertest
        .del('/sally/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(501)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectTokenAndMeta('howdy', sally);
          done();
        });
    });

    it('GET should fail with a non-server token', function (done) {
      setupTokenAndMeta();
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(1, null, pair1);
      supertest
        .get('/billy/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(401, done);
    });
  });

  describe('/:userid/:collection', function () {
    var metatest1 = {
      name: 'Testy',
      bio: 'Awesome is my game.'
    };
    var metatest2 = {
      shortname: 'Boo',
      bio: 'Haunting is my game.'
    };

    it('GET should return 404 because it doesn\'t exist yet', function (done) {
      setupTokenAndMeta();
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(404)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectTokenAndMeta('howdy');
          done();
        });
    });

    it('POST should return a 200 on success', function (done) {
      setupTokenAndMeta();
      supertest
        .post('/billy/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectTokenAndMeta('howdy');
          done();
        });
    });

    it('GET should return 200 and stored result on success', function (done) {
      setupTokenAndMeta();
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectTokenAndMeta('howdy');
          done();
        });
    });

    it('PUT should return 200 on success', function (done) {
      setupTokenAndMeta();
      supertest
        .put('/billy/profile')
        .send(metatest2)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectTokenAndMeta('howdy');
          done();
        });
    });

    it('GET should return 200 and updated result on success', function (done) {
      setupTokenAndMeta();
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectTokenAndMeta('howdy');
          done();
        });
    });

    it('DELETE should return 501 because it doesn\'t work yet', function (done) {
      setupTokenAndMeta();
      supertest
        .del('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(501)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectTokenAndMeta('howdy');
          done();
        });
    });
  });

  describe('/:userid/private', function () {
    it('should return 404 on GET', function (done) {
      supertest.get('/billy/private')
        .expect(404, done);
    });

    it('should return 404 on POST', function (done) {
      supertest.post('/billy/private')
        .expect(404, done);
    });

    it('should return 404 on PUT', function (done) {
      supertest.put('/billy/private')
        .expect(404, done);
    });

    it('should return 404 on DELETE', function (done) {
      supertest.del('/billy/private')
        .expect(404, done);
    });
  });

  describe('/publicinfo', function () {
    var sally = { userid: 'sally', isserver: true };
    var bobby = { userid: 'bobby', isserver: false };

    beforeEach(function () {
      mockableObject.reset(userApiClient);
    });



    it('should return 400 on GET with no query', function (done) {
      setupTokenAndMeta(sally);
      var request = sinon.stub(userApiClient, 'getUserInfo');
      request.withArgs('12345', sinon.match.func).callsArgWith(1, null, {userid: '12345', username: 'a', emails: ['a@b']});
      request.withArgs('23456', sinon.match.func).callsArgWith(1, null, null);
      supertest.get('/publicinfo')
        .set(sessionTokenHeader, 'sally')
        .expect(400, done);
    });

    it('should return 400 on GET of a valid query with a server token', function (done) {
      setupTokenAndMeta(sally);
      var request = sinon.stub(userApiClient, 'getUserInfo');
      request.withArgs('12345', sinon.match.func).callsArgWith(1, null, {userid: '12345', username: 'a', emails: ['a@b']});
      request.withArgs('23456', sinon.match.func).callsArgWith(1, null, null);
      supertest.get('/publicinfo?users=12345,23456')
        .set(sessionTokenHeader, 'sally')
        .expect(400, done);
    });

    it('should return 200 on GET and an error reply with a valid query with user token', function (done) {
      setupTokenAndMeta(bobby);
      var request = sinon.stub(userApiClient, 'getUserInfo');
      request.withArgs('12345', sinon.match.func).callsArgWith(1, null, {userid: '12345', username: 'a', emails: ['a@b']});
      request.withArgs('23456', sinon.match.func).callsArgWith(1, {statuscode: 500, message: 'error'}, null);
      supertest
        .get('/publicinfo?users=12345,23456')
        .set(sessionTokenHeader, 'bobby')
        .expect(200)
        .end(function (err, res) {
          console.log(res.body);
          expect(err).to.not.exist;
          expect(res.body).to.have.lengthOf(2);
          expect(res.body[0].userid).to.equal('12345');
          expect(res.body[0].error).to.not.exist;
          expect(res.body[1].userid).to.equal('23456');
          expect(res.body[1].error).to.exist;
          done();
        });
    });

    it('should return 200 on GET and a good reply with a real query', function (done) {
      setupTokenAndMeta(bobby);
      var request = sinon.stub(userApiClient, 'getUserInfo');
      request.withArgs('12345', sinon.match.func).callsArgWith(1, null, {userid: '12345', username: 'a', emails: ['a@b']});
      request.withArgs('23456', sinon.match.func).callsArgWith(1, null, null);
      supertest
        .get('/publicinfo?users=12345')
        .set(sessionTokenHeader, 'bobby')
        .expect(200)
        .end(function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).to.have.lengthOf(1);
          expect(res.body[0].userid).to.equal('12345');
          expect(res.body[0].username).to.equal('a');
          expect(res.body[0].emails).to.exist;
          done();
        });
    });
  });

});

