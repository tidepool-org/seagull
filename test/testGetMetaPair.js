/*
 == BSD2 LICENSE ==
 Copyright (c) 2016, Tidepool Project

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

var salinity = require('salinity');
var expect = salinity.expect;
var sinon = salinity.sinon;
var mockableObject = salinity.mockableObject;
// expect violates this jshint thing a lot, so we just suppress it
/* jshint expr: true */

var userApiClient = mockableObject.make('getMetaPair');
var gatekeeperClient = mockableObject.make('userInGroup');
var getMeta = require('../lib/getMetaPair')(userApiClient, gatekeeperClient);

/***
*
* Rules:
*
* 1) if we are given a server token then use the userid specified
*     i.e. req._tokendata.isserver == true
*
* 2) if our token is a user token then
*
*     a) if the token user is the same as the userid specified then continue
*        i.e. req._tokendata.userid ===  req.params.userid
*
*     b) otherwise check that the token user is in req.params.userid's 'patients' or 'team' group
*
***/
describe('getMetaPair:', function () {

  var res = mockableObject.make('send');
  var req = {};
  var emptyResponse = {};


  function setupStubs(response) {


    mockableObject.reset(gatekeeperClient);
    mockableObject.reset(userApiClient);
    mockableObject.reset(res);

    sinon.stub(res, 'send').returns(response);

    var userInGroup = sinon.stub(gatekeeperClient, 'userInGroup');
    userInGroup.withArgs('sally', 'bob').returns('bob');
    userInGroup.withArgs('sally', 'sally').returns('sally');
    userInGroup.withArgs('sally', 'other').returns('other');

    var getMetaPair = sinon.stub(userApiClient, 'getMetaPair');

    getMetaPair.withArgs('bob').returns('bob');
    getMetaPair.withArgs('sally').returns('sally');
    getMetaPair.withArgs('other').returns(false);
  }

  it('should exist', function () {
    expect(getMeta).to.exist;
  });


  describe('given a no token', function () {
    it('should return false', function () {
      setupStubs({statusCode:401, message:'No Token'});

      expect(getMeta(req,res, function(result){
        expect(result).to.be.false;
      }));

    });
  });

  describe('given a server token', function () {
    it('should return empty', function () {
      setupStubs(emptyResponse);

      var req = { method:'GET', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req, res, function(result){
        console.log(' ### result is', result);
        expect(result).to.be.a('undefined');
      }));

    });
    it('should not worry about the req.method', function () {
      setupStubs(emptyResponse);

      var req = { method:'POST', _tokendata:{ userid: 'sally', isserver: true }, params:{userid:'sally'}};

      expect(getMeta(req,res, function(result){
        expect(result).to.be.a('undefined');
      }));
    });
    it('should not worry that the userid differ', function () {
      setupStubs(emptyResponse);

      var req = { method:'GET', _tokendata:{ userid: 'sally', isserver: true }, params:{userid:'bob'}};

      expect(getMeta(req,res, function(result){
        expect(result).to.be.a('undefined');
      }));
    });
  });

  describe('given a user token for requested userid', function () {
    it('should be valid when id matches', function () {
      setupStubs(emptyResponse);

      var req = { method:'GET', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'bob'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.be.a('undefined');
      }));

    });
    it('should be valid for PUT method', function () {
      setupStubs(emptyResponse);

      var req = { method:'PUT', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'sally'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.be.a('undefined');
      }));

    });
    it('should be valid for POST method', function () {
      setupStubs(emptyResponse);

      var req = { method:'POST', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'sally'}};

      expect(getMeta(req, res, function(result){
        console.log('Woop there it is', result);
        expect(result).to.be.a('undefined');
      }));
    });
    it('should be valid for DEL method', function () {
      setupStubs(emptyResponse);

      var req = { method:'DEL', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'sally'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.be.a('undefined');
      }));
    });
  });

  describe('given a user token for different userid', function () {
    it('should invalid when not in group', function () {
      setupStubs(emptyResponse);

      var req = { method:'GET', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req,res, function(result){
        expect(result).to.equal(false);
      }));
    });
    it('should be valid when in group and GET', function () {
      setupStubs(emptyResponse);

      var req = { method:'GET', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.equal(false);
      }));
    });
    it('should be invalid when in group and POST', function () {
      setupStubs(emptyResponse);

      var req = { method:'POST', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.equal(false);
      }));
    });
    it('should be invalid when in group and PUT', function () {
      setupStubs(emptyResponse);

      var req = { method:'PUT', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.equal(false);
      }));
    });
    it('should be invalid when in group and DEL', function () {
      setupStubs(emptyResponse);

      var req = { method:'DEL', _tokendata:{ userid: 'sally', isserver: false }, params:{userid:'other'}};

      expect(getMeta(req, res, function(result){
        expect(result).to.equal(false);
      }));
    });
  });
});
