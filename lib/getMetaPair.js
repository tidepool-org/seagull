// == BSD2 LICENSE ==
// Copyright (c) 2014, Tidepool Project
//
// This program is free software; you can redistribute it and/or modify it under
// the terms of the associated License, which is identical to the BSD 2-Clause
// License as published by the Open Source Initiative at opensource.org.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the License for more details.
//
// You should have received a copy of the License along with this program; if
// not, you can obtain one from Tidepool Project at tidepool.org.
// == BSD2 LICENSE ==

'use strict';

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
var checkUserPermissions = function(request, userClient, armadaClient, cb){

  var tokenUserId = request._tokendata.userid;
  var requestedUserId = request.params.userid;

  if (request._tokendata.isserver) {
    return cb(null, requestedUserId);
  } else if ( tokenUserId != requestedUserId) {

    userClient.withServerToken(function(error,serverToken){
      armadaClient.getGroupsAMemberOf(
        tokenUserId,
        serverToken,
        function(error,groups){
          /*
            TODO: check the actual groups
          */
          return cb(error,requestedUserId);
        });
    });
  } else {
    return cb(null, tokenUserId);
  }
};


/***
 prepare and return the error response when required
**/
var errorResponse = function(res, next, error){
  if (error.statusCode != null) {
    res.send(error.statusCode);
    return next(false);
  }
  else {
    res.send(500);  // internal server error -- something broke
    return next(false);
  }
};

/***
  Function: getMetaPair(userClient, armadaClient)
  Desc: Middleware to retrieve the "meta" token pair -- expects _tokendata to be set on the request
        object.  The _tokendata object must have a userid field.  The easiest way to make
        sure that these are on the request before this middleware runs is to include the checkToken
        middleware first.  If all goes well, attaches the _metapair variable on the request.
  Args: userClient -- client to use when talking to the user-api
        armadaClient -- client to use when talking to the armada service
**/
module.exports = function(userClient, armadaClient) {
  return function(req, res, next) {
    if (req._tokendata == null) {
      res.send(401, 'No Token');
      return next(false);
    }

    checkUserPermissions(req, userClient, armadaClient, function(permissionsError,userid){

      if (permissionsError) {
        return errorResponse(res,next,permissionsError);
      } else {
        userClient.getMetaPair(userid, function(metaPairError, pair) {
          if (metaPairError) {
            return errorResponse(res,next,metaPairError);
          }
          else if (pair == null) {
            res.send(401, 'No metapair for you!');
            return next(false);
          }
          else {
            req._metapair = pair;
            return next();
          }
        });
      }
    });
  };
};