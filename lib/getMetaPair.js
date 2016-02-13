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

var _ = require('lodash');

module.exports = function(userClient) {

  return function(req, res, next) {
    userClient.getMetaPair(req.params.userid, function(error, metapair) {
      if (!_.isEmpty(error)) {
        res.send(error.statusCode || 500);
        return next(false);
      } 
      if (_.isEmpty(metapair)) {
        res.send(401, 'Unauthorized');
        return next(false);
      }
      req._metapair = metapair;
      return next();
    });
  };
};
