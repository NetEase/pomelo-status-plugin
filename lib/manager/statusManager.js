var utils = require('../util/utils');
var redis = require('redis');

var DEFAULT_PREFIX = 'POMELO:STATUS';

var StatusManager = function(app, opts) {
  this.app = app;
  this.opts = opts || {};
  this.prefix = opts.prefix || DEFAULT_PREFIX;
  this.host = opts.host;
  this.port = opts.port;
  this.slaveConf = opts.slaveConf;
  this.redis = null;
  this.redisSlaves = [];
};

module.exports = StatusManager;

StatusManager.prototype.start = function(cb) {
  var self = this;
  //init redis slaves
  this.slaveConf.forEach(function(conf){
    var slave = redis.createClient(conf.port, conf.host);
    if(conf.auth_pass) {
      slave.auth(conf.auth_pass);
    }
    slave.on("error", function(err){
      console.error("[status-plugin][redis-slave]"+ err.stack);
    });
    self.redisSlaves.push(slave);
  });
  //init redis master
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
  //stop slaves
  this.redisSlaves.forEach(function(slave){
    slave.end();
  });
  this.redisSlaves = [];
  utils.invokeCallback(cb);
};

//clean on master
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

//write on master
StatusManager.prototype.add = function(uid, sid ,cb) {
 	this.redis.sadd(genKey(this, uid), sid, function(err) {
    utils.invokeCallback(cb, err);
  });
};

//write on master
StatusManager.prototype.leave = function(uid, sid, cb) {
	this.redis.srem(genKey(this, uid), sid, function(err) {
    utils.invokeCallback(cb, err);
  });
};

//read on slave
StatusManager.prototype.getSidsByUid = function(uid, cb) {
  randomRedisSlave(this).smembers(genKey(this, uid), function(err, list) {
    utils.invokeCallback(cb, err, list);
  });
};

//read on slave
StatusManager.prototype.getSidsByUids = function(uids, cb) {
  var cmds = [];
  for (var i=0; i<uids.length; i++) {
    cmds.push(['exists', genKey(this, uids[i])]);
  }
  execMultiCommands(randomRedisSlave(this), cmds, function(err, list) {
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

//return random redis slave instance.
var randomRedisSlave = function(self){
  return self.redisSlaves[Math.floor(Math.random()*self.redisSlaves.length)];
};