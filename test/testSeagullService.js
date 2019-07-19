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
  mongoConnectionString: 'mongodb://localhost/seagull_test',
  // the special config value we pass for testing will enable us to wipe the database
  _wipeTheEntireDatabase: true,
  logger: { error: console.log, warn: console.log, info: console.log }
};

var userApiClient = mockableObject.make('checkToken', 'getAnonymousPair');
var gatekeeperClient = mockableObject.make('userInGroup', 'groupsForUser');
var metrics = mockableObject.make('postServer', 'postThisUser', 'postWithUser');

var dbmongo = require('../lib/mongoCrudHandler.js')(env);
var seagull = require('../lib/seagullService.js')(env, dbmongo, userApiClient, gatekeeperClient, metrics);
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
    mockableObject.reset(metrics);
    mockableObject.reset(gatekeeperClient);
    sinon.stub(metrics, 'postServer').callsArg(3);
    sinon.stub(metrics, 'postWithUser').callsArg(3);
    sinon.stub(metrics, 'postThisUser').callsArg(3);
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
        expect(obj.body.down).to.eql([]);
        expect(obj.body.up).to.eql(['mongo']);
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
        expect(obj.body).deep.equals(['profile', 'groups', 'private']);
        done();
      });
  });

  var defaultUser = {userid: 'billy' };

  function setupToken(user) {
    user = user || defaultUser;
    sinon.stub(userApiClient, 'checkToken').callsArgWith(1, null, user);
  }

  function expectToken(token) {
    expect(userApiClient.checkToken).to.have.been.calledOnce;
    expect(userApiClient.checkToken).to.have.been.calledWith(token, sinon.match.func);
  }

  describe('/:userid/private/:name', function () {
    var pair1 = { name: '', id: 'will', hash: 'a' };

    var sally = { userid: 'sally', isserver: true };

    it('GET should create all required objects if they don\'t exist', function (done) {
      setupToken(sally);
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(0, null, pair1);
      supertest
        .get('/sally/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectToken('howdy');
          expect(userApiClient.getAnonymousPair).to.have.been.calledOnce;
          expect(userApiClient.getAnonymousPair).to.have.been.calledWith(sinon.match.func);
          done();
        });
    });

    it('GET should create just the pair if it doesn\'t exist', function (done) {
      setupToken(sally);
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(0, null, pair1);
      supertest
        .get('/sally/private/clamshell')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectToken('howdy');
          expect(userApiClient.getAnonymousPair).to.have.been.calledOnce;
          expect(userApiClient.getAnonymousPair).to.have.been.calledWith(sinon.match.func);
          done();
        });
    });

    it('GET should get the pair if it already exists', function (done) {
      setupToken(sally);
      supertest
        .get('/sally/private/clamshell')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(pair1);
          expectToken('howdy');
          done();
        });
    });

    it('DELETE should return 501 because it doesn\'t work yet', function (done) {
      setupToken(sally);
      supertest
        .del('/sally/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(501)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
          done();
        });
    });

    it('GET should fail with a non-server token', function (done) {
      setupToken();
      sinon.stub(userApiClient, 'getAnonymousPair').callsArgWith(0, null, pair1);
      supertest
        .get('/billy/private/armada')
        .set(sessionTokenHeader, 'howdy')
        .expect(401, done);
    });
  });

  describe('/:userid/:collection', function () {
    var metatest1 = {
      fullName: 'Billy McBillface',
      name: 'Testy',
      bio: 'Awesome is my game.'
    };
    var metatest2 = {
      shortname: 'Boo',
      bio: 'Haunting is my game.'
    };
    var settingstest = {
      siteChangeSource: 'cannulaPrime',
      bgTarget: {'high': 180, 'low': 72},
      units: {'bg': 'mg/dL'}
    };
    var sally = { userid: 'sally', isserver: true };

    it('GET should return 404 because it doesn\'t exist yet (server)', function (done) {
      setupToken(sally);
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}});
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(404)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
          done();
        });
    });

    it('GET should return 404 because it doesn\'t exist yet (same user id)', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}});
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(404)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
          done();
        });
    });

    it('GET should return 404 because it doesn\'t exist yet (with different user ids; with member permissions)', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}});
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2, null, {'view': {}});
      supertest
        .get('/bob/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(404)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
          expect(userInGroupStub).to.have.been.called.once;
          done();
        });
    });

    it('GET should return 401 because it is a different user id without member permissions or server', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2);
      supertest
        .get('/bob/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
          expect(userInGroupStub).to.have.been.called.twice;
          done();
        });
    });

    it('POST should return a 200 on success (server)', function (done) {
      setupToken(sally);
      supertest
        .post('/billy/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectToken('howdy');
          done();
        });
    });

    it('POST should return a 200 on success (same user)', function (done) {
      setupToken();
      supertest
        .post('/billy/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectToken('howdy');
          done();
        });
    });

    it('POST should return a 200 on success (with different user ids; with custodian permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2, null, {'custodian': {}});
      supertest
        .post('/bob/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectToken('howdy');
          done();
        });
    });

    it('POST should return a 401 on authorization failure (with different user ids; with no permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2);
      supertest
        .post('/bob/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals('Unauthorized');
          expectToken('howdy');
          done();
        });
    });

    it('POST should return a 401 on authorization failure (with different user ids; with other than custodial permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2, null, {'view': {}});
      supertest
        .post('/bob/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals('Unauthorized');
          expectToken('howdy');
          done();
        });
    });

    it('GET profile should return 200 and only fullName if not a trustor', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}});
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals({"fullName": "Billy McBillface"});
          expectToken('howdy');
          done();
        });
    });

    it('GET profile should return 200 and full stored result if a trustor', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}, 'billy': {view: {}}});
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectToken('howdy');
          done();
        });
    });

    it('GET profile should return 200 and full stored result if request is from the server', function (done) {
      setupToken(sally);
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(metatest1);
          expectToken('howdy');
          done();
        });
    });

    it('PUT non-profile should return a 200 on success (server)', function (done) {
      setupToken(sally);
      supertest
        .post('/billy/settings')
        .send(settingstest)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(settingstest);
          expectToken('howdy');
          done();
        });
    });

    it('GET non-profile should return 401 if not a trustor', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}});
      supertest
        .get('/billy/settings')
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals('Unauthorized');
          expectToken('howdy');
          done();
        });
    });

    it('GET non-profile should return 200 and full stored result if a trustor', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'sally': {root: {}}, 'billy': {view: {}}});
      supertest
        .get('/billy/settings')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(settingstest);
          expectToken('howdy');
          done();
        });
    });

    it('GET non-profile should return 200 and full stored result if request is from the server', function (done) {
      setupToken(sally);
      supertest
        .get('/billy/settings')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(settingstest);
          expectToken('howdy');
          done();
        });
    });

    it('PUT should return a 200 on success (server)', function (done) {
      setupToken(sally);
      supertest
        .post('/billy/profile')
        .send(metatest2)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectToken('howdy');
          done();
        });
    });

    it('PUT should return a 200 on success (same user)', function (done) {
      setupToken();
      supertest
        .post('/billy/profile')
        .send(metatest2)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectToken('howdy');
          done();
        });
    });

    it('PUT should return a 200 on success (with different user ids; with custodian permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2, null, {'custodian': {}});
      supertest
        .post('/bob/profile')
        .send(metatest2)
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectToken('howdy');
          done();
        });
    });

    it('PUT should return a 401 on authorization failure (with different user ids; with no permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2);
      supertest
        .post('/bob/profile')
        .send(metatest2)
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals('Unauthorized');
          expectToken('howdy');
          done();
        });
    });

    it('PUT should return a 401 on authorization failure (with different user ids; with other than custodial permissions)', function (done) {
      setupToken();
      var userInGroupStub = sinon.stub(gatekeeperClient, 'userInGroup');
      userInGroupStub.callsArgWith(2, null, {'view': {}});
      supertest
        .post('/bob/profile')
        .send(metatest1)
        .set(sessionTokenHeader, 'howdy')
        .expect(401)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals('Unauthorized');
          expectToken('howdy');
          done();
        });
    });

    it('GET should return 200 and updated result on success', function (done) {
      setupToken();
      sinon.stub(gatekeeperClient, 'groupsForUser').callsArgWith(1, null, {'billy': {root: {}}});
      supertest
        .get('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(200)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expect(res.body).deep.equals(_.extend(_.cloneDeep(metatest1), metatest2));
          expectToken('howdy');
          done();
        });
    });

    it('DELETE should return 501 because it doesn\'t work yet', function (done) {
      setupToken();
      supertest
        .del('/billy/profile')
        .set(sessionTokenHeader, 'howdy')
        .expect(501)
        .end(
        function (err, res) {
          expect(err).to.not.exist;
          expectToken('howdy');
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
});

