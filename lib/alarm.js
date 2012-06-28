var glob = require('./glob.js').glob;

/**
 * Internal watcher class
 *
 * The watcher is metric-specific, and so an alarm will have many watchers, each
 * assigned to track the state of a single metric.
 */
function watcher(parent, metric) {
    /* Save our parent */
    this.parent = parent;
    /* Save the metric we're attached to */
    this.metric = metric;
    /* We start out in the OK state */
    this.state  = this.OK;
    /* We've never seen this condition before */
    this.last   = Infinity;
    
    console.log('Making new watcher for ' + metric.name);
    
    /* Bind, for callback */
    var me = this;
    this.s = metric.on('data', function(time, count, avg, min, max, pctile) {
        var res = me.parent.condition(time, count, avg, min, max, pctile);
        if (res) {
            /* This data point was alarming. If we're not in the alarm state, we 
             * should begin tracking it as if we're in the alarm state */
            if (me.state != me.ALARM) {
                me.last = Math.min(time, me.last);
                if (time - me.last >= me.parent.duration) {
                    /* We're now in a state of alarm. BOOO! */
                    me.state = me.ALARM;
                    me.parent.callback(me.metric, 'alarm');
                    console.log(me.metric.name + ' is ALARM now');
                }
            }
        } else {
            /* This data point is not alarming */
            if (me.state != me.OK) {
                me.last = Math.min(time, me.last);
                if (time - me.last >= me.parent.duration) {
                    /* We're now in an ok state. Hooray! */
                    me.state = me.OK;
                    me.parent.callback(me.metric, 'ok');
                    console.log(me.metric.name + ' is OK now');
                }
            }
        }
    });
}

/* Watcher states */
watcher.prototype.OK    = 0;
watcher.prototype.ALARM = 1;
watcher.prototype.STALE = 2;

/**
 * An alarm for watching metrics
 *
 * This class is not meant to be instantiated by users, but is returned to 
 * users
 */
function alarm(db, pattern, condition, duration, callback) {
    this.pattern   = pattern;
    this.condition = condition;
    this.duration  = duration;
    this.callback  = callback;
    this.watchers  = {};
    this.db        = db;
    
    /* Make a glob for us to use */
    this.glob = new glob(pattern);
    
    /* Bind, for callbacks */
    var me = this;
    /* Register a callback for all new metrics created, so that we can check if 
     * they need to be monitored as well */
    this.new = db.on('new', function(name) {
        if (me.glob.match(name) && me.watchers && me.watchers[name] == null) {
            me.watchers[name] = new watcher(me, me.db.metric(name));
            console.log('New metric ' + name + ' matches');
        }
    });
    
    /* Register a callback for all metrics that are deleted, so we can stop 
     * monitoring them */
    this.remove = db.on('remove', function(name) {
        if (me.glob.match(name) && me.watchers && me.watchers[name]) {
            me.watchers[name].s.off();
            delete me.watchers[name];
            console.log('Remove metric ' + name + ' matches');
        }
    });
    
    if (pattern.indexOf('*') != -1) {
        /* Sign up all of our watchers */
        var matches = db.find(pattern);
        for (var i in matches) {
            var metric = matches[i];
            this.watchers[metric.name] = new watcher(this, metric);
        }
    } else {
        this.watchers[pattern] = new watcher(this, db.metric(pattern));
    }
}

/**
 * Stop caring about alarms
 */
alarm.prototype.off = function() {
    /* Turn off our subscriptions to new metrics */
    this.new.off();
    this.remove.off();
    /* Turn off all the subscriptions for our watchers */
    for (var i in this.watchers) {
        this.watchers[i].s.off();
        delete this.watchers[i];
    }
    /* Oh, and delete all of our watchers */
    delete this.watchers;
}

exports.alarm = alarm;