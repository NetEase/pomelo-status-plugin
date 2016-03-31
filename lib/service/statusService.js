var DefaultStatusManager = require('../manager/statusManager');
var utils = require('../util/utils');
var util = require('util');
var countDownLatch = require('../util/countDownLatch');
var logger = require('pomelo-logger').getLogger(__filename);

var ST_INITED = 0;
var ST_STARTED = 1;
var ST_CLOSED = 2;

var StatusService = function(app, opts) {
  this.app = app;
  this.opts = opts || {};
  this.cleanOnStartUp = opts.cleanOnStartUp;
  this.manager = getStatusManager(app, opts);
  this.state = ST_INITED;
};

module.exports = StatusService;

StatusService.prototype.start = function(cb) {
  if(this.state !== ST_INITED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  if(typeof this.manager.start === 'function') {
    var self = this;
    this.manager.start(function(err) {
      if(!err) {
        self.state = ST_STARTED;
      }
      if(!!self.cleanOnStartUp) {
        self.manager.clean(function(err) {
          utils.invokeCallback(cb, err);
        });
      } else {
        utils.invokeCallback(cb, err);
      }
    });
  } else {
    process.nextTick(function() {
      utils.invokeCallback(cb);
    });
  }
  
};

StatusService.prototype.stop = function(force, cb) {
  this.state = ST_CLOSED;

  if(typeof this.manager.stop === 'function') {
    this.manager.stop(force, cb);
  } else {
    process.nextTick(function() {
      utils.invokeCallback(cb);
    });
  }
};


StatusService.prototype.add = function(uid, sid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.add(uid, sid, cb);
};


StatusService.prototype.leave = function(uid, sid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.leave(uid, sid, cb);
};


StatusService.prototype.getSidsByUid = function(uid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.getSidsByUid(uid, cb);
};

StatusService.prototype.getStatusByUid = function(uid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.getSidsByUid(uid, function(err, list) {
    if (!!err) {
      utils.invokeCallback(cb, new Error(util.format('failed to get serverIds by uid: [%s], err: %j', uid, err.stack)), null);
      return;
    }
    var status = (list !== undefined && list.length >= 1)
      ? true // online
      : false; // offline
    utils.invokeCallback(cb, null, status);
  });
};

StatusService.prototype.getStatusByUids = function(uids, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.getSidsByUids(uids, function(err, replies) {
    if (!!err) {
      utils.invokeCallback(cb, new Error(util.format('failed to get serverIds by uids, err: %j', err.stack)), null);
      return;
    }

    var statuses = {};
    for (var i=0; i<uids.length; i++) {
      statuses[uids[i]] = (replies[i] == 1)
        ? true // online
        : false; // offline
    }

    utils.invokeCallback(cb, null, statuses);
  });
};


StatusService.prototype.pushByUids = function(uids, route, msg, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }
  var channelService = this.app.get('channelService');
  var successFlag = false;
  var count = utils.size(uids);
  var records = [];

  var latch = countDownLatch.createCountDownLatch(count, function(){
    if(!successFlag) {
      utils.invokeCallback(cb, new Error(util.format('failed to get sids for uids: %j', uids)), null);
      return;
    }
    else {
      if(records != null && records.length != 0){
        channelService.pushMessageByUids(route, msg, records, cb);
      }else{
        utils.invokeCallback(cb, null, null);
      }
    }
  });
  
  for(var i=0; i< uids.length; i++) {
    (function (self, arg) {
      self.getSidsByUid(uids[arg], function (err, list) {
        if (!!err) {
          utils.invokeCallback(cb, new Error(util.format('failed to get serverIds by uid: [%s], err: %j', uids[arg], err.stack)), null);
          return;
        }
        for (var j = 0, l = list.length; j < l; j++) {
          records.push({uid: uids[arg], sid: list[j]});
        }
        
        successFlag = true;
        latch.done();
      })
    })(this, i);
  }
};


var getStatusManager = function(app, opts) {
  var manager;
  
  if(typeof opts.statusManager === 'function') {
    manager = new opts.statusManager(app, opts);
  } else {
    manager = opts.statusManager;
  }

  if(!manager) {
    manager = new DefaultStatusManager(app, opts);
  }

  return manager;
};
