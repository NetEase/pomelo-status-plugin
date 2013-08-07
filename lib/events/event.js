var statusService = require('../service/statusService');
var logger = require('pomelo-logger').getLogger(__filename);

var Event = function(app) {
	this.app = app;
  this.statusService = app.get('statusService');
};

module.exports = Event;

Event.prototype.bind_session = function(session) {
  if(!session.uid) {
    return;
  }
	this.statusService.add(session.uid, session.frontendId, function(err) {
    if(!!err) {
      logger.error('statusService add user failed: [%s] [%s], err: %j', session.uid, session.frontendId, err);
      return;
    }
  });
};

Event.prototype.close_session = function(session) {
  if(!session.uid) {
    return;
  }
  this.statusService.leave(session.uid, session.frontendId, function(err) {
    if(!!err) {
      logger.error('failed to kick user in statusService: [%s] [%s], err: %j', session.uid, session.frontendId, err);
      return;
    }
  });
};