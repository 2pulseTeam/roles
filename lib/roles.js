"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Meteor = Package.meteor.Meteor;
var Mongo = Package.mongo.Mongo;
var _Package$check = Package.check,
    check = _Package$check.check,
    Match = _Package$check.Match;

/*
 * Helpers
 */

var willChangeWithParent = function willChangeWithParent(object, key) {
  if (!_.isObject(object)) {
    return;
  }
  var willChange = false;
  _.each(_.keys(object), function (modifyingKey) {
    if (key && key.indexOf(modifyingKey) === 0) {
      willChange = true;
    }
  });
  return willChange;
};

var objectHasKey = function objectHasKey(object, key) {
  var dotNotation = {};

  (function recurse(obj, current) {
    for (var key in obj) {
      var value = obj[key];
      var newKey = current ? current + "." + key : key; // joined key with dot
      if (value && (typeof value === "undefined" ? "undefined" : _typeof(value)) === "object") {
        recurse(value, newKey); // it's a nested object, so do it again
      } else {
        dotNotation[newKey] = value; // it's not an object, so set the property
      }
    }
  })(object);

  var keys = _.keys(dotNotation);
  var newKeys = [];

  _.each(keys, function (_key) {
    var parts = _key.split('.');
    var added = [];
    _.each(parts, function (part) {
      if (!isNaN(part)) {
        part = '$';
        added.push(part);
      } else {
        added.push(part);
        newKeys.push(added.join('.'));
      }
    });
  });

  return _.includes(newKeys, key);
};

/**
 * Init the variable
 */
var Roles = {};

Roles.debug = false;

/**
 * Initialize variables
 */
Roles._roles = {};
Roles._actions = [];
Roles._helpers = [];
Roles._usersCollection = Meteor.users;
Roles._specialRoles = ['__loggedIn__', '__notAdmin__', '__notLoggedIn__', '__all__'];

/**
 * Old collection
 */
Roles._oldCollection = new Mongo.Collection('roles');

/**
 * Get the list of roles
 */
Roles.availableRoles = function () {
  return _.difference(_.keys(this._roles), this._specialRoles);
};

/**
 * Check if a user has a role
 */
Roles.userHasRole = function (userId, role) {
  if (role == '__all__') return true;
  if (role == '__notLoggedIn__' && !userId) return true;
  if (role == '__default__' && userId) return true;
  if (role == '__notAdmin__' && Roles._usersCollection.find({ _id: userId, roles: 'admin' }).count() === 0) return true;
  return Roles._usersCollection.find({ _id: userId, roles: role }).count() > 0;
};

/**
 * Creates a new action
 */
Roles.registerAction = function (name, adminAllow, adminDeny) {
  check(name, String);
  check(adminAllow, Match.Optional(Match.Any));
  check(adminDeny, Match.Optional(Match.Any));

  if (!_.includes(this._actions, name)) {
    this._actions.push(name);
  }

  if (adminAllow) {
    Roles.adminRole.allow(name, adminAllow);
  }

  if (adminDeny) {
    Roles.adminRole.deny(name, adminDeny);
  }
};

/**
 * Creates a new helper
 */
Roles.registerHelper = function (name, adminHelper) {
  check(name, String);
  check(adminHelper, Match.Any);

  if (!_.includes(this._helpers, name)) {
    this._helpers.push(name);
  }

  if (adminHelper) {
    Roles.adminRole.helper(name, adminHelper);
  }
};

/**
 * Constructs a new role
 */
Roles.Role = function (name) {
  check(name, String);

  if (!(this instanceof Roles.Role)) throw new Error('use "new" to construct a role');

  if (_.has(Roles._roles, name)) throw new Error('"' + name + '" role is already defined');

  this.name = name;
  this.allowRules = {};
  this.denyRules = {};
  this.helpers = {};

  Roles._roles[name] = this;
};

/**
 * Adds allow properties to a role
 */
Roles.Role.prototype.allow = function (action, allow) {
  check(action, String);
  check(allow, Match.Any);

  if (!_.includes(Roles._actions, action)) {
    Roles.registerAction(action);
  }

  if (!_.isFunction(allow)) {
    var clone = _.clone(allow);
    allow = function allow() {
      return clone;
    };
  }

  this.allowRules[action] = this.allowRules[action] || [];
  this.allowRules[action].push(allow);
};

/**
 * Adds deny properties to a role
 */
Roles.Role.prototype.deny = function (action, deny) {
  check(action, String);
  check(deny, Match.Any);

  if (!_.includes(Roles._actions, action)) {
    Roles.registerAction(action);
  }

  if (!_.isFunction(deny)) {
    var clone = _.clone(deny);
    deny = function deny() {
      return clone;
    };
  }

  this.denyRules[action] = this.denyRules[action] || [];
  this.denyRules[action].push(deny);
};

/**
 * Adds a helper to a role
 */
Roles.Role.prototype.helper = function (helper, func) {
  check(helper, String);
  check(func, Match.Any);

  if (!_.includes(Roles._helpers, helper)) {
    Roles.registerHelper(helper);
  }

  if (!_.isFunction(func)) {
    var value = _.clone(func);
    func = function func() {
      return value;
    };
  }

  if (!this.helpers[helper]) {
    this.helpers[helper] = [];
  }

  this.helpers[helper].push(func);
};

/**
 * Get user roles
 */
Roles.getUserRoles = function (userId, includeSpecial) {
  check(userId, Match.OneOf(String, null, undefined));
  check(includeSpecial, Match.Optional(Boolean));
  var object = Roles._usersCollection.findOne({ _id: userId }, { fields: { roles: 1 } });
  var roles = object && object.roles || [];
  if (includeSpecial) {
    roles.push('__all__');
    if (!userId) {
      roles.push('__notLoggedIn__');
    } else {
      roles.push('__loggedIn__');
      if (!_.includes(roles, 'admin')) {
        roles.push('__notAdmin__');
      }
    }
  }

  return roles;
};

/**
 * Calls a helper
 */
Roles.helper = function (userId, helper) {
  var _this = this;

  check(userId, Match.OneOf(String, null, undefined));
  check(helper, String);
  if (!_.includes(this._helpers, helper)) throw 'Helper "' + helper + '" is not defined';

  var args = _.toArray(arguments).slice(2);
  var context = { userId: userId };
  var responses = [];
  var roles = Roles.getUserRoles(userId, true);

  _.each(roles, function (role) {
    if (_this._roles[role] && _this._roles[role].helpers && _this._roles[role].helpers[helper]) {
      var helpers = _this._roles[role].helpers[helper];
      _.each(helpers, function (helper) {
        responses.push(helper.apply(context, args));
      });
    }
  });

  return responses;
};

/**
 * Returns if the user passes the allow check
 */
Roles.allow = function (userId, action) {
  check(userId, Match.OneOf(String, null, undefined));
  check(action, String);

  var args = _.toArray(arguments).slice(2);
  var self = this;
  var context = { userId: userId };
  var allowed = false;
  var roles = Roles.getUserRoles(userId, true);

  _.each(roles, function (role) {
    if (!allowed && self._roles[role] && self._roles[role].allowRules && self._roles[role].allowRules[action]) {
      _.each(self._roles[role].allowRules[action], function (func) {
        var allow = func.apply(context, args);
        if (allow === true) {
          allowed = true;
        }
      });
    }
  });

  return allowed;
};

/**
 * Returns if the user has permission using deny and deny
 */
Roles.deny = function (userId, action) {
  var _this2 = this;

  check(userId, Match.OneOf(String, null, undefined));
  check(action, String);

  var args = _.toArray(arguments).slice(2);
  var context = { userId: userId };
  var denied = false;
  var roles = Roles.getUserRoles(userId, true);

  _.each(roles, function (role) {
    if (!denied && _this2._roles[role] && _this2._roles[role].denyRules && _this2._roles[role].denyRules[action]) {
      _.each(_this2._roles[role].denyRules[action], function (func) {
        var denies = func.apply(context, args);
        if (denies === true) {
          denied = true;
          if (Roles.debug) {
            console.log("[" + action + "] denied for " + userId + " with role " + role);
          }
        }
      });
    }
  });

  return denied;
};

/**
 * To check if a user has permisisons to execute an action
 */
Roles.userHasPermission = function () {
  var allows = this.allow.apply(this, arguments);
  var denies = this.deny.apply(this, arguments);
  return allows === true && denies === false;
};

/**
 * If the user doesn't has permission it will throw a error
 */
Roles.checkPermission = function () {
  if (!this.userHasPermission.apply(this, arguments)) {
    throw new Meteor.Error('unauthorized', 'The user has no permission to perform this action');
  }
};

/**
 * Adds helpers to users
 */
Roles.setUsersHelpers = function () {
  Roles._usersCollection.helpers({
    /**
     * Returns the user roles
     */
    getRoles: function getRoles(includeSpecial) {
      return Roles.getUserRoles(this._id, includeSpecial);
    },
    /**
     * To check if the user has a role
     */
    hasRole: function hasRole(role) {
      return Roles.userHasRole(this._id, role);
    }
  });
};

Roles.setUsersHelpers();

/**
 * The admin role, who recives the default actions.
 */
Roles.adminRole = new Roles.Role('admin');Roles._adminRole = Roles.adminRole; // Backwards compatibility
/**
 * All the logged in users users
 */
Roles.loggedInRole = new Roles.Role('__loggedIn__');Roles.defaultRole = Roles.loggedInRole; // Backwards compatibility
/**
 * The users that are not admins
 */
Roles.notAdminRole = new Roles.Role('__notAdmin__');
/**
 * The users that are not logged in
 */
Roles.notLoggedInRole = new Roles.Role('__notLoggedIn__');
/**
 * Always, no exception
 */
Roles.allRole = new Roles.Role('__all__');

/**
 * A Helper to attach actions to collections easily
 */
Mongo.Collection.prototype.attachRoles = function (name, dontAllow) {
  Roles.registerAction(name + '.insert', !dontAllow);
  Roles.registerAction(name + '.update', !dontAllow);
  Roles.registerAction(name + '.remove', !dontAllow);
  Roles.registerHelper(name + '.forbiddenFields', []);

  this.allow({
    insert: function insert(userId, doc) {
      var allows = Roles.allow(userId, name + '.insert', userId, doc);
      if (Roles.debug && !allows) {
        console.log("[" + name + ".insert] not allowed for " + userId);
      }

      return allows;
    },

    update: function update(userId, doc, fields, modifier) {
      var allows = Roles.allow(userId, name + '.update', userId, doc, fields, modifier);
      if (Roles.debug && !allows) {
        console.log("[" + name + ".update] not allowed for " + userId);
      }

      return allows;
    },

    remove: function remove(userId, doc) {
      var allows = Roles.allow(userId, name + '.remove', userId, doc);
      if (Roles.debug && !allows) {
        console.log("[" + name + ".remove] not allowed for " + userId);
      }

      return allows;
    }
  });

  this.deny({
    insert: function insert(userId, doc) {
      return Roles.deny(userId, name + '.insert', userId, doc);
    },

    update: function update(userId, doc, fields, modifier) {
      return Roles.deny(userId, name + '.update', userId, doc, fields, modifier);
    },

    remove: function remove(userId, doc) {
      return Roles.deny(userId, name + '.remove', userId, doc);
    }
  });

  this.deny({
    insert: function insert(userId, doc) {
      var forbiddenFields = _.union.apply(this, Roles.helper(userId, name + '.forbiddenFields'));

      for (var i in forbiddenFields) {
        var field = forbiddenFields[i];
        if (objectHasKey(doc, field)) {
          if (Roles.debug) {
            console.log("[" + name + ".forbiddenField] Field " + field + " is forbidden for " + userId);
          }

          return true;
        }
      }
    },

    update: function update(userId, doc, fields, modifier) {
      var forbiddenFields = _.union.apply(this, Roles.helper(userId, name + '.forbiddenFields', doc._id));
      var types = ['$inc', '$mul', '$rename', '$setOnInsert', '$set', '$unset', '$min', '$max', '$currentDate'];

      // By some reason following for will itterate even through empty array. This will prevent unwanted habbit.
      if (forbiddenFields.length === 0) {
        return false;
      }

      for (var i in forbiddenFields) {
        var field = forbiddenFields[i];
        for (var j in types) {
          var type = types[j];
          if (objectHasKey(modifier[type], field)) {
            if (Roles.debug) {
              console.log("[" + name + ".forbiddenField] Field " + field + " is forbidden for " + userId);
            }

            return true;
          }

          if (willChangeWithParent(modifier[type], field)) {
            if (Roles.debug) {
              console.log("[" + name + ".forbiddenField] Field " + field + " is forbidden for " + userId + " is been changed by a parent object");
            }

            return true;
          }
        }
      }
    }
  });
};

Roles.keys = {};

/**
 * Initialize the collection
 */
Roles.keys.collection = new Meteor.Collection('nicolaslopezj_roles_keys');

/**
 * Set the permissions
 * Users can request keys just for them
 */
Roles.keys.collection.allow({
  insert: function insert(userId, doc) {
    return userId === doc.userId;
  },
  remove: function remove(userId, doc) {
    return userId === doc.userId;
  }
});

/**
 * Requests a new key
 * @param  {String} userId    Id of the userId
 * @param  {Date}   expiresAt Date of expiration
 * @return {String}           Id of the key
 */
Roles.keys.request = function (userId, expiresAt) {
  check(userId, String);
  var doc = {
    userId: userId,
    createdAt: new Date()
  };
  if (expiresAt) {
    check(expiresAt, Date);
    doc.expiresAt = expiresAt;
  }
  return this.collection.insert(doc);
};

/**
 * Returns the userId of the specified key and deletes the key from the database
 * @param  {String}  key
 * @param  {Boolean} dontDelete True to leave the key in the database
 * @return {String}             Id of the user
 */
Roles.keys.getUserId = function (key, dontDelete) {
  check(key, String);
  check(dontDelete, Match.Optional(Boolean));

  var doc = this.collection.findOne({ _id: key, $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: new Date() } }] });
  if (!doc) return;

  if (!dontDelete) {
    if (!doc.expiresAt) {
      console.log('borrando por no tener expire at');
      this.collection.remove({ _id: key });
    } else {
      if (moment(doc.expiresAt).isBefore(moment())) {
        console.log('borrando por expire at ya pasó');
        this.collection.remove({ _id: key });
      }
    }
  }

  return doc.userId;
};

if (Meteor.isServer) {
  /**
   * Adds roles to a user
   */
  Roles.addUserToRoles = function (userId, roles) {
    check(userId, String);
    check(roles, Match.OneOf(String, Array));
    if (!_.isArray(roles)) {
      roles = [roles];
    }

    return Meteor.users.update({ _id: userId }, { $addToSet: { roles: { $each: roles } } });
  };

  /**
   * Set user roles
   */
  Roles.setUserRoles = function (userId, roles) {
    check(userId, String);
    check(roles, Match.OneOf(String, Array));
    if (!_.isArray(roles)) {
      roles = [roles];
    }

    return Meteor.users.update({ _id: userId }, { $set: { roles: roles } });
  };

  /**
   * Removes roles from a user
   */
  Roles.removeUserFromRoles = function (userId, roles) {
    check(userId, String);
    check(roles, Match.OneOf(String, Array));
    if (!_.isArray(roles)) {
      roles = [roles];
    }

    return Meteor.users.update({ _id: userId }, { $pullAll: { roles: roles } });
  };

  /**
   * Requires a permission to run a resolver
   */
  var defaultOptions = {
    returnNull: false,
    showKey: true,
    mapArgs: function mapArgs() {
      for (var _len = arguments.length, args = Array(_len), _key2 = 0; _key2 < _len; _key2++) {
        args[_key2] = arguments[_key2];
      }

      return args;
    }
  };
  Roles.action = function (action, userOptions) {
    var options = _extends({}, defaultOptions, userOptions);
    return function (target, key, descriptor) {
      var fn = descriptor.value || target[key];
      if (typeof fn !== 'function') {
        throw new Error("@Roles.action decorator can only be applied to methods not: " + (typeof fn === "undefined" ? "undefined" : _typeof(fn)));
      }

      return {
        configurable: true,
        get: function get() {
          var newFn = function newFn(root, params, context) {
            for (var _len2 = arguments.length, other = Array(_len2 > 3 ? _len2 - 3 : 0), _key3 = 3; _key3 < _len2; _key3++) {
              other[_key3 - 3] = arguments[_key3];
            }

            var args = options.mapArgs.apply(options, [root, params, context].concat(other));
            var hasPermission = Roles.userHasPermission.apply(Roles, [context.userId, action].concat(_toConsumableArray(args)));
            if (hasPermission) {
              return fn.apply(undefined, [root, params, context].concat(other));
            } else {
              if (options.returnNull) {
                return null;
              } else {
                var keyText = options.showKey ? " \"" + action + "\" in \"" + key + "\"" : '';
                throw new Error("The user has no permission to perform the action" + keyText);
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
}

exports.default = Roles;