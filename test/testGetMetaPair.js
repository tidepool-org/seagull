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

var userApiClient = mockableObject.make('getMetaPair');
var getMetaPair = require('../lib/getMetaPair')(userApiClient);

describe('getMetaPair', function() {

  var res = mockableObject.make('send');
  var callback;

  beforeEach(function () {
    mockableObject.reset(userApiClient);
    mockableObject.reset(res);
    sinon.stub(res, 'send');
    callback = sinon.spy();
  });

  it('exists', function() {
    expect(getMetaPair).to.exist;
  });

  it('sends response status code specified and invokes next with false', function() {
    sinon.stub(userApiClient, 'getMetaPair').withArgs('user').callsArgWith(1, {statusCode: 400, message: 'error message'});

    getMetaPair({params: {userid: 'user'}}, res, callback);
    expect(callback).to.have.been.calledWithExactly(false);
    expect(res.send).to.have.been.calledWithExactly(400);
    expect(userApiClient.getMetaPair).to.have.been.calledWithExactly('user', sinon.match.func);
  });

  it('sends response status code 500 and invokes next with false', function() {
    sinon.stub(userApiClient, 'getMetaPair').withArgs('user').callsArgWith(1, {message: 'error message'});

    getMetaPair({params: {userid: 'user'}}, res, callback);
    expect(callback).to.have.been.calledWithExactly(false);
    expect(res.send).to.have.been.calledWithExactly(500);
    expect(userApiClient.getMetaPair).to.have.been.calledWithExactly('user', sinon.match.func);
  });

  it('sends response status code 401 Unauthorized and invokes next with false', function() {
    sinon.stub(userApiClient, 'getMetaPair').withArgs('user').callsArgWith(1);

    getMetaPair({params: {userid: 'user'}}, res, callback);
    expect(callback).to.have.been.calledWithExactly(false);
    expect(res.send).to.have.been.calledWithExactly(401, 'Unauthorized');
    expect(userApiClient.getMetaPair).to.have.been.calledWithExactly('user', sinon.match.func);
  });

  it('sets _metapair on response and succeeds', function() {
    sinon.stub(userApiClient, 'getMetaPair').withArgs('user').callsArgWith(1, null, 'present');

    var req = {params: {userid: 'user'}};
    getMetaPair(req, res, callback);
    expect(callback).to.have.been.calledWithExactly();
    expect(res.send).to.not.have.been.called;
    expect(req._metapair).to.equal('present');
    expect(userApiClient.getMetaPair).to.have.been.calledWithExactly('user', sinon.match.func);
  });
});
