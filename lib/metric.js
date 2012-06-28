var fs     = require('fs');
var path   = require('path');
var wrench = require('wrench');

/* Internal imports */
var callbacks = require('./callback').callbacks;

function metric(name, db) {
    /* Save our name and database */
    this.name = name;
    this.db   = db;
    
    /* Reserve some space for our children */
    this.children = [];
    
    /* Determine if I have a parent metric */
    var index = this.name.lastIndexOf('/');
    if (index != -1) {
        /* We have a parent! Hooray! */
        this.parent = db.metric(this.name.substr(0, index));
        this.parent.children.push(this);
    } else {
        this.parent = null;
    }
    
    /* Let's set some space aside for our data */
    this.data = [];
    /* Our registered on-data callbacks */
    this.datacbs = new callbacks();
}

/**
 * Add data to this particular metric
 *
 * By default, the average will be used to populate any missing fields
 */
metric.prototype.add = function(time, count, avg, min, max, pctile) {
    /* Invoke our data callbacks */
    this.datacbs.invoke(time, count, avg, min, max, pctile);
}

/**
 * Get all the data points for the provided range [start, end]
 *
 * This function returns an array of arrays, whose indices correspond to 
 * time, count, avg, min, max and pctile
 */
metric.prototype.get = function(start, end) {
    /* Read in all the necessary data, including whatever's in memory */
}

/**
 * Read in the provided time slice
 *
 * Returns data as it would be returned from `get` from the provided path
 */
metric.prototype.read = function(path) {
    
}

/**
 * Flush in-memory data to disk
 *
 * In general, this should be called in the worker thread, and is meant to
 * operate asynchronously.
 */
metric.prototype.flush = function() {
    
}

/**
 * Rotate all the files that need to be rotated out
 *
 * Any files that are too old should be deleted, and all other files should be
 * at their configured resolution by the time this function completes
 */
metric.prototype.rotate = function() {
    
}

/**
 * Subscribe to events on this data
 */
metric.prototype.on = function(evt, f) {
    if (evt == 'data') {
        return this.datacbs.add(f);
    } else {
        throw "Evt must be 'data'";
    }
}

exports.metric = metric;