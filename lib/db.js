/* External tools */
var fs        = require('fs');
var path      = require('path');
var wrench    = require('wrench');

/* Internal imports */
var glob      = require('./glob').glob;
var alarm     = require('./alarm').alarm;
var metric    = require('./metric').metric;
var callbacks = require('./callback').callbacks;

/**
 * The database class is the only thing that most user-code should ever interact 
 * with.
 *
 * Obviously, it represents the entire database of metrics
 */
function DB(pth) {
    /* Normalize the path, ensure it exists */
    this.path = path.normalize(path.resolve(pth));
    try {
        if (!fs.statSync(this.path).isDirectory()) {
            console.log('Path is not a directory');
        }
    } catch(e) {
        wrench.mkdirSyncRecursive(this.path, 0777);
    }
    
    /* Save a place to store metrics */
    this.metrics = {}
    
    /* Save a place for our new and remove callbacks */
    this.newcbs    = new callbacks();
    this.removecbs = new callbacks();
    
    /* Let's save all of our alarms somewhere */
    this.alarms = [];
}

/**
 * Find all the metrics matching the provided glob
 *
 * Unlike `metric`, it will not instantiate any metrics if they don't exist
 */
DB.prototype.find = function(pattern) {
    var g       = new glob(pattern);
    var results = [];
    for (var i in this.metrics) {
        if (g.match(i)) {
            results.push(this.metrics[i]);
        }
    }
    return results;
}

/**
 * Return the metric object with the given name.
 *
 * If no such metric currently exists, instantiate it and then return it
 */
DB.prototype.metric = function(name) {
    var m = this.metrics[name];
    if (m == null) {
        m = new metric(name, this);
        this.metrics[name] = m;
        this.newcbs.invoke(name);
    }
    return m;
}

/**
 * Remove the metric `name` from the DB
 *
 * If no such metric exists, it doesn't make fuss. Alternatively, glob-style 
 * removes are also allowed, so that deletions and be performed in bulk
 */
DB.prototype.remove = function(name) {
    /* First, check if it's a glob */
    if (name.indexOf('*') != -1) {
        /* Alright, this is definitely not the most efficient implementation in 
         * the world, but it's not entirely unreasonable */
        var metrics = this.find(name);
        /* Now, sort them based on their depth, beginning with those that are 
         * the deepest */
        metrics.sort(function(a, b) {
            return b.name.split('/').length - a.name.split('/').length;
        });
        /* Now go through each of them, and if they don't have a child, then we 
         * can safely remove it */
        for (var i in metrics) {
            var metric = metrics[i];
            if (metric.children.length == 0) {
                /* Can delete it */
                delete this.metrics[metric.name];
                if (metric.parent != null) {
                    var index = metric.parent.children.indexOf(metric);
                    metric.parent.children.splice(index,1);
                }
                this.removecbs.invoke(metric.name);
            }
        }
    } else {
        var m = this.metrics[name];
        if (m == null) {
            return true;
        } else if (m.children.length > 0) {
            return false;
        } else {
            delete this.metrics[name];
            if (m.parent != null) {
                /* Remove the child from the parent's children */
                var index = m.parent.children.indexOf(m);
                m.parent.children.splice(index,1);
            }
            this.removecbs.invoke(name);
            return true;
        }
    }
}

/**
 * Register a callback for the provided event
 *
 * Users may register a callback for when new metrics are created, when metrics 
 * are removed, and also on a per-metric basis for updates. A subscription 
 * object is returned, which may later be used to deregister the callback
 */
DB.prototype.on = function(evt, f) {
    if (evt === 'new') {
        return this.newcbs.add(f);
    } else if (evt == 'remove') {
        return this.removecbs.add(f);
    } else {
        /* Metric events */
        return this.metric(evt).on('data', f);
    }
}

/**
 * Register an alarm for the provided metric
 *
 * If any metric matching the provided glob (even if it doesn't yet exist) meets
 * `condition` for `duration` seconds, `callback` is invoked
 */
DB.prototype.if = function(name, condition, duration, callback) {
    /* We should create an alarm, and return that object */
    return new alarm(this, name, condition, duration, callback);
}

/**
 * Add the provided data point to the metric named
 */
DB.prototype.add = function(name, time, count, avg, min, max, pctile) {
    this.metric(name).add(time, count, avg, min, max, pctile);
}

exports.DB = DB;