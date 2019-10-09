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
var mockableObject = salinity.mockableObject;
var sinon = salinity.sinon;

var env = {
  httpPort: 21000,
};

var mockCrudHandler = mockableObject.make('getDoc', 'closeDatabase');
var mockUserApiClient = mockableObject.make('checkToken', 'getAnonymousPair', 'getUserInfo', 'getUsersWithIds');
var mockGatekeeperClient = mockableObject.make('userInGroup', 'groupsForUser', 'usersInGroup');
var mockMetrics = mockableObject.make('postServer', 'postThisUser', 'postWithUser');

var seagull = require('../lib/seagullService.js')(env, mockCrudHandler, mockUserApiClient, mockGatekeeperClient, mockMetrics);
var supertest = require('supertest')('http://localhost:' + env.httpPort);

describe('seagull/users', function () {

  before(function (done) {
    seagull.start(done);
  });

  after(function () {
    seagull.close();
  });

  beforeEach(function () {
    mockableObject.reset(mockCrudHandler);
    mockableObject.reset(mockUserApiClient);
    mockableObject.reset(mockGatekeeperClient);
    mockableObject.reset(mockMetrics);
  });

  describe('GET /users/:userid/users', function (done) {

    var alphaUser, alphaProfile, alphaTrustorPermissions, alphaTrusteePermissions, alphaDoc, alphaFinal;
    var bravoUser, bravoProfile, bravoTrustorPermissions, bravoTrusteePermissions, bravoDoc, bravoFinal;
    var targetUser, custodianUser;
    var serverToken, targetToken, custodianToken, viewerToken;

    var sessionTokenId;
    var targetUrl;

    function setupData() {
      alphaUser = { userid: 'alpha', username: 'alpha@tidepool.org', emailVerified: true, termsAccepted: '2016-01-01T12:00:00-07:00', passwordExists: true };
      alphaProfile = { fullName: 'Alpha', patient: { birthday: '2001-11-30', diagnosisDate: '2010-12-31' } };
      alphaTrustorPermissions = { upload: {}, view: {} };
      alphaTrusteePermissions = { view: {} };
      alphaDoc = { detail: { profile: alphaProfile } };
      alphaFinal = _.merge({}, alphaUser, { profile: alphaProfile, trustorPermissions: alphaTrustorPermissions, trusteePermissions: alphaTrusteePermissions });

      bravoUser = { userid: 'bravo', username: 'bravo@tidepool.org', emailVerified: false, termsAccepted: '2015-12-31T23:59:59-08:00', passwordExists: true };
      bravoProfile = { fullName: 'Bravo', patient: { birthday: '1970-01-30', diagnosisDate: '1990-02-31' } };
      bravoTrustorPermissions = { view: {} };
      bravoTrusteePermissions = { upload: {}, view: {} };
      bravoDoc = { detail: { profile: bravoProfile } };
      bravoFinal = _.merge({}, bravoUser, { profile: bravoProfile, trustorPermissions: bravoTrustorPermissions, trusteePermissions: bravoTrusteePermissions });

      targetUser = { userid: 'target', groups: {}, users: {} };
      targetUser.groups[alphaUser.userid] = alphaTrustorPermissions;
      targetUser.groups[bravoUser.userid] = bravoTrustorPermissions;
      targetUser.users[alphaUser.userid] = alphaTrusteePermissions;
      targetUser.users[bravoUser.userid] = bravoTrusteePermissions;

      custodianUser = { userid: 'custodian', permissions: { custodian: {} } };

      serverToken = { userid: 'server', isserver: true };
      targetToken = { userid: targetUser.userid, isserver: false };
      custodianToken = { userid: custodianUser.userid, isserver: false };
      viewerToken = { userid: 'stranger', isserver: false };

      sessionTokenId = targetToken.userid;

      targetUrl = '/users/' + targetUser.userid + '/users';
    }

    var getDocStub, closeDbStub, checkTokenStub, getUserInfoStub, getUsersWithIdsStub, userInGroupStub, groupsForUserStub, usersInGroupStub;

    function setupStubs() {
      getDocStub = sinon.stub(mockCrudHandler, 'getDoc');
      closeDbStub = sinon.stub(mockCrudHandler, 'closeDatabase');
      checkTokenStub = sinon.stub(mockUserApiClient, 'checkToken');
      getUserInfoStub = sinon.stub(mockUserApiClient, 'getUserInfo');
      getUsersWithIdsStub = sinon.stub(mockUserApiClient, 'getUsersWithIds');
      userInGroupStub = sinon.stub(mockGatekeeperClient, 'userInGroup');
      groupsForUserStub = sinon.stub(mockGatekeeperClient, 'groupsForUser');
      usersInGroupStub = sinon.stub(mockGatekeeperClient, 'usersInGroup');

      checkTokenStub.withArgs(serverToken.userid).callsArgWith(1, null, serverToken);
      checkTokenStub.withArgs(targetToken.userid).callsArgWith(1, null, targetToken);
      checkTokenStub.withArgs(custodianToken.userid).callsArgWith(1, null, custodianToken);
      checkTokenStub.withArgs(viewerToken.userid).callsArgWith(1, null, viewerToken);
      checkTokenStub.callsArgWith(1, { statusCode: 401 }, null);
      userInGroupStub.withArgs(custodianToken.userid, targetUser.userid).callsArgWith(2, null, { custodian: {} });
      userInGroupStub.withArgs(viewerToken.userid, targetUser.userid).callsArgWith(2, null, { view: {} });
      groupsForUserStub.withArgs(targetUser.userid).callsArgWith(1, null, targetUser.groups);
      usersInGroupStub.withArgs(targetUser.userid).callsArgWith(1, null, targetUser.users);
      getUserInfoStub.withArgs(alphaUser.userid).callsArgWith(1, null, alphaUser);
      getUserInfoStub.withArgs(bravoUser.userid).callsArgWith(1, null, bravoUser);
      getUsersWithIdsStub.withArgs([alphaUser.userid]).callsArgWith(1, null, [alphaUser]);
      getUsersWithIdsStub.withArgs([bravoUser.userid]).callsArgWith(1, null, [bravoUser]);
      getUsersWithIdsStub.withArgs([alphaUser.userid, bravoUser.userid]).callsArgWith(1, null, [alphaUser, bravoUser]);
      getDocStub.withArgs(alphaUser.userid).callsArgWith(1, null, alphaDoc);
      getDocStub.withArgs(bravoUser.userid).callsArgWith(1, null, bravoDoc);

      sinon.stub(mockMetrics, 'postServer').callsArg(3);
      sinon.stub(mockMetrics, 'postThisUser').callsArg(3);
    }

    beforeEach(function () {
      setupData();
      setupStubs();
    });

    function sanitizeUsers() {
      if (sessionTokenId !== serverToken.userid) {
        alphaFinal = _.omit(alphaFinal, 'passwordExists');
        bravoFinal = _.omit(bravoFinal, 'passwordExists');
      }
    }

    function test(url, statusCode, expectations, done) {
      supertest
        .get(url)
        .set('x-tidepool-session-token', sessionTokenId)
        .expect(statusCode)
        .end(function (err, res) {
          _.forEach(expectations, function (expectation) {
            expectation(err, res);
          });
          done(err);
        });
    }

    function expectSuccessfulTest(url, expectations, done) {
      return test(url, 200, _.flatten([expectNoError, expectations]), done);
    }

    function expectUnauthorizedTest(url, expectations, done) {
      return test(url, 401, _.flatten([expectNoError, expectations]), done);
    }

    function expectNoError(err, res) {
      expect(err).to.not.exist;
    }

    function expectBodyWithEmptyObject(err, res) {
      expect(res.body).deep.equals({});
    }

    function expectBodyWithEmptyArray(err, res) {
      expect(res.body).deep.equals([]);
    }

    function expectBodyWithAlpha(err, res) {
      sanitizeUsers();
      expect(res.body).deep.equals([alphaFinal]);
    }

    function expectBodyWithBravo(err, res) {
      sanitizeUsers();
      expect(res.body).deep.equals([bravoFinal]);
    }

    function expectBodyWithAlphaAndBravo(err, res) {
      sanitizeUsers();
      expect(res.body).deep.equals([alphaFinal, bravoFinal]);
    }

    function expectCheckToken() {
      expect(mockUserApiClient.checkToken).to.have.been.calledOnce;
      expect(mockUserApiClient.checkToken).to.have.been.calledWithExactly(sessionTokenId, sinon.match.func);
    }

    function expectUserInGroupNotCalled() {
      expect(mockGatekeeperClient.userInGroup).to.not.have.been.called;
    }

    function expectUserInGroup() {
      expectCheckToken();
      expect(mockGatekeeperClient.userInGroup).to.have.been.calledOnce;
      expect(mockGatekeeperClient.userInGroup).to.have.been.calledWithExactly(sinon.match.string, targetUser.userid, sinon.match.func);
    }

    function expectGroupsForUserNotCalled() {
      expect(mockGatekeeperClient.groupsForUser).to.not.have.been.called;
    }

    function expectGroupsForUser() {
      expectCheckToken();
      expect(mockGatekeeperClient.groupsForUser).to.have.been.calledOnce;
      expect(mockGatekeeperClient.groupsForUser).to.have.been.calledWithExactly(targetUser.userid, sinon.match.func);
    }

    function expectUsersInGroup() {
      expectGroupsForUser();
      expect(mockGatekeeperClient.usersInGroup).to.have.been.calledOnce;
      // sinon doesn't know about async function signatures, so we have to teach it.
      const asyncFunc = sinon.match(function (actual) {
        return sinon.typeOf(actual) === 'asyncfunction';
      }, 'typeOf(asyncfunction)');
    
      expect(mockGatekeeperClient.usersInGroup).to.have.been.calledWithExactly(targetUser.userid, asyncFunc);
    }

    function expectGetUserInfoNotCalled() {
      expect(mockUserApiClient.getUserInfo).to.not.have.been.called;
    }

    function expectGetDocNotCalled() {
      expect(mockCrudHandler.getDoc).to.not.have.been.called;
    }

    function expectGetDocForAlpha() {
      expect(mockCrudHandler.getDoc).to.have.been.calledOnce;
      expect(mockCrudHandler.getDoc).to.have.been.calledWithExactly(alphaUser.userid, sinon.match.func);
    }

    function expectGetDocForBravo() {
      expect(mockCrudHandler.getDoc).to.have.been.calledOnce;
      expect(mockCrudHandler.getDoc).to.have.been.calledWithExactly(bravoUser.userid, sinon.match.func);
    }

    function expectGetDocForAlphaAndBravo() {
      expect(mockCrudHandler.getDoc).to.have.been.calledTwice;
      expect(mockCrudHandler.getDoc.firstCall).to.have.been.calledWithExactly(alphaUser.userid, sinon.match.func);
      expect(mockCrudHandler.getDoc.secondCall).to.have.been.calledWithExactly(bravoUser.userid, sinon.match.func);
    }

    it('returns 401 without session token', function(done) {
      sessionTokenId = null;
      expectUnauthorizedTest(targetUrl,
          [expectBodyWithEmptyObject, expectUserInGroupNotCalled, expectGroupsForUserNotCalled], done);
    });

    describe('with token data', function () {
      it('returns 401 with bogus session token', function(done) {
        sessionTokenId = 'bogus';
        expectUnauthorizedTest(targetUrl,
            [expectBodyWithEmptyObject, expectUserInGroupNotCalled, expectGroupsForUserNotCalled], done);
      });

      it('returns 401 for a session token that is not the user, nor server, nor custodian, but is a shared user', function(done) {
        sessionTokenId = viewerToken.userid;
        expectUnauthorizedTest(targetUrl,
            [expectUserInGroup, expectGroupsForUserNotCalled], done);
      });

      it('returns success and two shared users with no query, as user', function(done) {
        expectSuccessfulTest(targetUrl,
            [expectBodyWithAlphaAndBravo, expectUserInGroupNotCalled, expectGetDocForAlphaAndBravo], done);
          });

      it('returns success and two shared users with no query, as server', function(done) {
        sessionTokenId = serverToken.userid;
        expectSuccessfulTest(targetUrl,
            [expectBodyWithAlphaAndBravo, expectUserInGroupNotCalled, expectGetDocForAlphaAndBravo], done);
      });

      it('returns success and two shared users with no query, as custodian', function(done) {
        sessionTokenId = custodianToken.userid;
        expectSuccessfulTest(targetUrl,
            [expectBodyWithAlphaAndBravo, expectUserInGroup, expectGetDocForAlphaAndBravo], done);
      });

      it('returns failure with empty body due to error returned by userInGroup', function(done) {
        sessionTokenId = custodianToken.userid;
        userInGroupStub.withArgs(custodianToken.userid, targetUser.userid).callsArgWith(2, {statusCode: 503, message: 'ERROR'}, null);
        test(targetUrl, 503, [expectBodyWithEmptyObject], done);
      });

      describe('with trustor permissions data', function () {
        it('returns failure with empty body due to error returned by groupsForUser', function (done) {
          groupsForUserStub.withArgs(targetUser.userid).callsArgWith(1, { statusCode: 503, message: 'ERROR' }, null);
          test(targetUrl, 503, [expectBodyWithEmptyObject], done);
        });

        it('returns success and two shared users with query for a specific trustor permission (view)', function(done) {
          expectSuccessfulTest(targetUrl + '?trustorPermissions=view',
              [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
        });

        it('returns success and one shared user with query for a specific trustor permission (upload)', function (done) {
          expectSuccessfulTest(targetUrl + '?trustorPermissions=upload',
            [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
        });

          it('returns success and one shared user with query for multiple specific trustor permissions', function(done) {
            expectSuccessfulTest(targetUrl + '?trustorPermissions=upload,view',
                [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for multiple specific trustor permissions', function(done) {
            expectSuccessfulTest(targetUrl + '?trustorPermissions=upload,,,view',
                [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and no shared users with query for an unknown trustor permission', function(done) {
            expectSuccessfulTest(targetUrl + '?trustorPermissions=unknown',
                [expectBodyWithEmptyArray, expectUsersInGroup, expectGetUserInfoNotCalled], done);
          });

          it('returns success and no shared users with query for multiple unknown trustor permissions', function(done) {
            expectSuccessfulTest(targetUrl + '?trustorPermissions=unknown,,,view',
                [expectBodyWithEmptyArray, expectUsersInGroup, expectGetUserInfoNotCalled], done);
          });

          it('returns failure with empty body due to trustor permissions of any and another', function(done) {
            test(targetUrl + '?trustorPermissions=view,any', 400, [], done);
          });

          it('returns failure with empty body due to trustor permissions of none and another', function(done) {
            test(targetUrl + '?trustorPermissions=view,none', 400, [], done);
          });

          it('returns failure with empty body due to trustor permissions of any and none', function(done) {
            test(targetUrl + '?trustorPermissions=none,any', 400, [], done);
          });

          it('returns success and one shared user with query for trustor permissions of any', function(done) {
            delete targetUser.groups[bravoUser.userid];
            expectSuccessfulTest(targetUrl + '?trustorPermissions=any',
                [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for trustor permissions of none', function(done) {
            delete targetUser.groups[alphaUser.userid];
            delete alphaFinal.trustorPermissions;
            delete alphaFinal.profile.patient;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=none',
                [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing permissions)', function(done) {
            targetUser.groups[bravoUser.userid] = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
      });

      describe('with trustee permissions data', function () {
        it('returns failure with empty body due to error returned by usersInGroup', function(done) {
          usersInGroupStub.withArgs(targetUser.userid).callsArgWith(1, {statusCode: 503, message: 'ERROR'}, null);
          test(targetUrl, 503, [expectBodyWithEmptyObject], done);
        });

        it('returns success and two shared users with query for a specific trustee permission (view)', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=view',
              [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
        });

        it('returns success and one shared user with query for a specific trustee permission (upload)', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=upload',
              [expectBodyWithBravo, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
        });

        it('returns success and one shared user with query for multiple specific trustee permissions', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=upload,view',
              [expectBodyWithBravo, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
        });

        it('returns success and one shared user with query for multiple specific trustee permissions', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=upload,,,view',
              [expectBodyWithBravo, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
        });

        it('returns success and no shared users with query for an unknown trustee permission', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=unknown',
              [expectBodyWithEmptyArray, expectUsersInGroup, expectGetUserInfoNotCalled], done);
        });

        it('returns success and no shared users with query for multiple unknown trustee permissions', function(done) {
          expectSuccessfulTest(targetUrl + '?trusteePermissions=unknown,,,view',
              [expectBodyWithEmptyArray, expectUsersInGroup, expectGetUserInfoNotCalled], done);
        });

        it('returns failure with empty body due to trustee permissions of any and another', function(done) {
          test(targetUrl + '?trusteePermissions=view,any', 400, [], done);
        });

        it('returns failure with empty body due to trustee permissions of none and another', function(done) {
          test(targetUrl + '?trusteePermissions=view,none', 400, [], done);
        });

        it('returns failure with empty body due to trustee permissions of any and none', function(done) {
          test(targetUrl + '?trusteePermissions=none,any', 400, [], done);
        });

        it('returns success and one shared user with query for trustee permissions of any', function(done) {
          delete targetUser.users[bravoUser.userid];
          expectSuccessfulTest(targetUrl + '?trusteePermissions=any',
              [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
        });

        it('returns success and one shared user with query for trustee permissions of none', function(done) {
          delete targetUser.users[alphaUser.userid];
          delete alphaFinal.trusteePermissions;
          expectSuccessfulTest(targetUrl + '?trusteePermissions=none',
              [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
        });

        it('returns success and one shared user with query on multiple parameters that matches one (other missing permissions)', function(done) {
          targetUser.users[bravoUser.userid] = null;
          expectSuccessfulTest(targetUrl + '?trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
              [expectBodyWithAlpha, expectUsersInGroup, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
        });

        describe('with user data', function () {
          it('returns failure with empty body due to error returned by getUsersWithIds', function(done) {
            getUsersWithIdsStub.withArgs([alphaUser.userid, bravoUser.userid]).callsArgWith(1, 'error', null);
            test(targetUrl, 500, [expectBodyWithEmptyObject], done);
          });

          it('returns failure with empty body due to null returned by getUsersWithIds', function(done) {
            getUsersWithIdsStub.withArgs([alphaUser.userid, bravoUser.userid]).callsArgWith(1, null, null);
            test(targetUrl, 500, [expectBodyWithEmptyObject], done);
          });

          it('returns failure with empty body due to single null user returned by getUsersWithIds', function(done) {
            getUsersWithIdsStub.withArgs([alphaUser.userid, bravoUser.userid]).callsArgWith(1, null, [alphaUser]);
            test(targetUrl, 500, [expectBodyWithEmptyObject], done);
          });

          it('returns success and two shared users with query for a case-insensitive partial email that matches both', function(done) {
            expectSuccessfulTest(targetUrl + '?email=TIDEPOOL.ORG',
                [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query for a specific, case-insensitive email that matches one', function(done) {
            expectSuccessfulTest(targetUrl + '?email=ALPHA@TIDEPOOL.org',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and no shared users with query for an unknown email that matches none', function(done) {
            expectSuccessfulTest(targetUrl + '?email=unknown.org',
                [expectBodyWithEmptyArray, expectGetUserInfoNotCalled], done);
          });

          it('returns success and one shared user with query for email verified (TruE)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=TruE',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for email verified (YeS)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=YeS',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for email verified (Y)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=Y',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for email verified (1)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=1',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for email not verified (FalsE)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=FalsE',
                [expectBodyWithBravo, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
          });

          it('returns success and one shared user with query for email not verified (0)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=0',
                [expectBodyWithBravo, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
          });

          it('returns success and one shared user with query for email not verified (AnythinG)', function(done) {
            expectSuccessfulTest(targetUrl + '?emailVerified=AnythinG',
                [expectBodyWithBravo, expectGetUserInfoNotCalled, expectGetDocForBravo], done);
          });

          it('returns success and two shared users with query for a partial terms accepted that matches both', function(done) {
            expectSuccessfulTest(targetUrl + '?termsAccepted=20',
                [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and two shared users with query for a partial terms accepted that matches both (case insensitive)', function(done) {
            expectSuccessfulTest(targetUrl + '?termsAccepted=t',
                [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query for a partial terms accepted that matches one', function(done) {
            expectSuccessfulTest(targetUrl + '?termsAccepted=2016',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query for a specific terms accepted', function(done) {
            expectSuccessfulTest(targetUrl + '?termsAccepted=2016-01-01T12:00:00-07:00',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and no shared users with query for a terms accepted that does not match', function(done) {
            expectSuccessfulTest(targetUrl + '?termsAccepted=9999',
                [expectBodyWithEmptyArray, expectGetUserInfoNotCalled, expectGetDocNotCalled], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing username)', function(done) {
            bravoUser.username = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing termsAccepted)', function(done) {
            bravoUser.termsAccepted = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetUserInfoNotCalled, expectGetDocForAlpha], done);
          });

          describe('with profile data', function() {
            it('returns failure with empty body due to error returned by getDoc', function(done) {
              getDocStub.withArgs(alphaUser.userid).callsArgWith(1, {statusCode: 503, message: 'ERROR'}, null);
              test(targetUrl, 503, [expectBodyWithEmptyObject], done);
            });

            it('returns success and one shared user due to not found error returned by getDoc for one user', function(done) {
              getDocStub.withArgs(bravoUser.userid).callsArgWith(1, {statusCode: 404}, null);
              expectSuccessfulTest(targetUrl + '?name=A',
                  [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and two shared users with query for a partial name that matches both', function(done) {
              expectSuccessfulTest(targetUrl + '?name=A',
                  [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and one shared user with query for a partial name that matches one', function(done) {
              expectSuccessfulTest(targetUrl + '?name=LpH',
                  [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and no shared users with query for a partial name that matches none', function(done) {
              expectSuccessfulTest(targetUrl + '?name=AbC',
                  [expectBodyWithEmptyArray, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and two shared users with query for a partial birthday that matches both', function(done) {
              expectSuccessfulTest(targetUrl + '?birthday=-30',
                  [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and one shared user with query for a partial birthday that matches one', function(done) {
              expectSuccessfulTest(targetUrl + '?birthday=-11-',
                  [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and no shared users with query for a partial birthday that matches none', function(done) {
              expectSuccessfulTest(targetUrl + '?birthday=1900-',
                  [expectBodyWithEmptyArray, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and two shared users with query for a partial diagnosis date that matches both', function(done) {
              expectSuccessfulTest(targetUrl + '?diagnosisDate=-31',
                  [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
            });

            it('returns success and one shared user with query for a partial diagnosis date that matches one', function(done) {
              expectSuccessfulTest(targetUrl + '?diagnosisDate=-12-',
                  [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and no shared users with query for a partial diagnosis date that matches none', function(done) {
            expectSuccessfulTest(targetUrl + '?diagnosisDate=1900-',
                [expectBodyWithEmptyArray, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and two shared users with query on multiple parameters that matches both', function(done) {
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlphaAndBravo, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing fullName)', function(done) {
            bravoDoc.detail.profile.fullName = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing patient)', function(done) {
            bravoDoc.detail.profile.patient = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing birthday)', function(done) {
            bravoDoc.detail.profile.patient.birthday = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and one shared user with query on multiple parameters that matches one (other missing diagnosis date)', function(done) {
            bravoDoc.detail.profile.patient.diagnosisDate = null;
            expectSuccessfulTest(targetUrl + '?trustorPermissions=view&trusteePermissions=view&email=TIDEPOOL.ORG&termsAccepted=20&name=A&birthday=-30&diagnosisDate=-31',
                [expectBodyWithAlpha, expectGetDocForAlphaAndBravo], done);
          });

          it('returns success and two shared users with no query, without patient data', function(done) {
            targetUser.groups[bravoUser.userid] = {};
            delete bravoFinal.profile.patient;
            bravoFinal.trustorPermissions = {};
            expectSuccessfulTest(targetUrl,
                [expectBodyWithAlphaAndBravo, expectUserInGroupNotCalled, expectGetDocForAlphaAndBravo], done);
          });
            });
          });
        });
      });
    });
  });
});
