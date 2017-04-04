'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _meteor = require('meteor/meteor');

var _check = require('meteor/check');

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

/**
 * Adds roles to a user
 */
Roles.addUserToRoles = function (userId, roles) {
  (0, _check.check)(userId, String);
  (0, _check.check)(roles, _check.Match.OneOf(String, Array));
  if (!_.isArray(roles)) {
    roles = [roles];
  }

  return _meteor.Meteor.users.update({ _id: userId }, { $addToSet: { roles: { $each: roles } } });
};

/**
 * Set user roles
 */
Roles.setUserRoles = function (userId, roles) {
  (0, _check.check)(userId, String);
  (0, _check.check)(roles, _check.Match.OneOf(String, Array));
  if (!_.isArray(roles)) {
    roles = [roles];
  }

  return _meteor.Meteor.users.update({ _id: userId }, { $set: { roles: roles } });
};

/**
 * Removes roles from a user
 */
Roles.removeUserFromRoles = function (userId, roles) {
  (0, _check.check)(userId, String);
  (0, _check.check)(roles, _check.Match.OneOf(String, Array));
  if (!_.isArray(roles)) {
    roles = [roles];
  }

  return _meteor.Meteor.users.update({ _id: userId }, { $pullAll: { roles: roles } });
};

/**
 * Requires a permission to run a resolver
 */
var defaultOptions = {
  returnNull: false,
  showKey: true,
  mapArgs: function mapArgs() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return args;
  }
};
Roles.action = function (action, userOptions) {
  var options = _extends({}, defaultOptions, userOptions);
  return function (target, key, descriptor) {
    var fn = descriptor.value || target[key];
    if (typeof fn !== 'function') {
      throw new Error('@Roles.action decorator can only be applied to methods not: ' + (typeof fn === 'undefined' ? 'undefined' : _typeof(fn)));
    }

    return {
      configurable: true,
      get: function get() {
        var newFn = function newFn(root, params, context) {
          for (var _len2 = arguments.length, other = Array(_len2 > 3 ? _len2 - 3 : 0), _key2 = 3; _key2 < _len2; _key2++) {
            other[_key2 - 3] = arguments[_key2];
          }

          var _Roles;

          var args = options.mapArgs.apply(options, [root, params, context].concat(other));
          var hasPermission = (_Roles = Roles).userHasPermission.apply(_Roles, [context.userId, action].concat(_toConsumableArray(args)));
          if (hasPermission) {
            return fn.apply(undefined, [root, params, context].concat(other));
          } else {
            if (options.returnNull) {
              return null;
            } else {
              var keyText = options.showKey ? ' "' + action + '" in "' + key + '"' : '';
              throw new Error('The user has no permission to perform the action' + keyText);
            }
          }
        };
        Object.defineProperty(this, key, {
          value: newFn,
          configurable: true,
          writable: true
        });
        return newFn;
      }
    };
  };
};