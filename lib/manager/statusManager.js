var utils = require('../util/utils');
var redis = require('redis');

var DEFAULT_PREFIX = 'POMELO:STATUS';

var StatusManager = function(app, opts) {
  this.app = app;
  this.opts = opts || {};
  this.prefix = opts.prefix || DEFAULT_PREFIX;
  this.host = opts.host;
  this.port = opts.port;
  this.redis = null;
};

module.exports = StatusManager;

StatusManager.prototype.start = function(cb) {
	this.redis = redis.createClient(this.port, this.host, this.opts);
  if (this.opts.auth_pass) {
    this.redis.auth(this.opts.auth_pass);
  }
  this.redis.on("error", function (err) {
      console.error("[status-plugin][redis]" + err.stack);
  });
  this.redis.once('ready', cb);
};

StatusManager.prototype.stop = function(force, cb) {
  if(this.redis) {
    this.redis.end();
    this.redis = null;
  }
  utils.invokeCallback(cb);
};

StatusManager.prototype.clean = function(cb) {
  var cmds = [];
  var self = this;
  this.redis.keys(genCleanKey(this), function(err, list) {
    if(!!err) {
      utils.invokeCallback(cb, err);
      return;
    }
    for(var i=0; i<list.length; i++) {
      cmds.push(['del', list[i]]);
    }
    execMultiCommands(self.redis, cmds, cb);
  });
};

StatusManager.prototype.add = function(uid, sid ,cb) {
 	this.redis.sadd(genKey(this, uid), sid, function(err) {
    utils.invokeCallback(cb, err);
  });
};

StatusManager.prototype.leave = function(uid, sid, cb) {
	this.redis.srem(genKey(this, uid), sid, function(err) {
    utils.invokeCallback(cb, err);
  });
};

StatusManager.prototype.getSidsByUid = function(uid, cb) {
  this.redis.smembers(genKey(this, uid), function(err, list) {
    utils.invokeCallback(cb, err, list);
  });
};

StatusManager.prototype.getSidsByUids = function(uids, cb) {
  var cmds = [];
  for (var i=0; i<uids.length; i++) {
    cmds.push(['exists', genKey(this, uids[i])]);
  }
  execMultiCommands(this.redis, cmds, function(err, list) {
    utils.invokeCallback(cb, err, list);
  });
};

var execMultiCommands = function(redis, cmds, cb) {
  if(!cmds.length) {
    utils.invokeCallback(cb);
    return;
  }
  redis.multi(cmds).exec(function(err, replies) {
    utils.invokeCallback(cb, err, replies);
  });
};

var genKey = function(self, uid) {
  return self.prefix + ':' + uid;
};

var genCleanKey = function(self) {
  return self.prefix + '*';
};
