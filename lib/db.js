var fs        = require('fs');
var path      = require('path');
var wrench    = require('wrench');
var metric    = require('./metric').metric;
var callbacks = require('./callback').callbacks;

/* Subscription class */
function subscription(evt, id, db) {
    this.evt = evt;
    this.id  = id;
    this.db  = db;
}

subscription.prototype.off = function() {
    /* Turn this callback off */
    this.db.off(this.evt, this.id);
}

/* Database class */
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
}

DB.prototype.metric = function(name) {
    var m = this.metrics[name];
    if (m == null) {
        m = new metric(name, this);
        this.metrics[name] = m;
        this.newcbs.invoke(name);
    }
    return m;
}

DB.prototype.remove = function(name) {
    /* First, check if it's a glob */
    if (name.indexOf('*') != -1) {
        /* For right now, we're only going to match a single `*` */
        /* Still needs some thinking, though */
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

DB.prototype.on = function(evt, f) {
    if (evt === 'new') {
        return this.newcbs.add(f);
    } else if (evt == 'remove') {
        return this.removecbs.add(f);
    } else {
        /* Metric events */
    }
}

exports.DB = DB;