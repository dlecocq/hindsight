var fs     = require('fs');
var path   = require('path');
var async  = require('async');
var wrench = require('wrench');
var Buffer = require('buffer').Buffer;

/* Internal imports */
var callbacks = require('./callback').callbacks;

/**
 * How many bytes are we allowed to stuff into a time slice?
 */
var maxSliceSize = 10000;

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
    /* All of the alarms tied to this metric */
    this.alarms = [];
    
    /* We need to create our path */
    this.path   = path.resolve(db.path, name);
    try {
        if (!fs.statSync(this.path).isDirectory()) {
            console.log('Path is not a directory');
        }
    } catch(e) {
        wrench.mkdirSyncRecursive(this.path, 0777);
    }
    
    /* This is an array of timestamps that correspond to files we have on disk.
     * A file with the name `this.path`/<timestamp> has data beginning at 
     * timestamp. */
    this.timestamps = [];
    
    /* Upon initiailization, we should read in any timestamp slices that might 
     * exist in our directory */
    var me = this;
    fs.readdir(this.path, function(err, files) {
        async.map(files, function(f, callback) {
            fs.stat(path.resolve(me.path, f), callback);
        }, function(err, results) {
            for (var i in results) {
                if (results[i].isDirectory()) {
                    var name = me.name + '/' + files[i];
                    /* Let the database know it should open that metric */
                    process.nextTick(function() { db.metric(name); });
                } else {
                    me.timestamps.push(parseInt(files[i]));
                }
            }
            me.timestamps.sort(function(a, b) { return a - b; });
        });
    });
}

/**
 * Remove this metric and clean up after itself
 *
 * This includes removing the directory the holds this data asynchronously
 */
metric.prototype.remove = function() {
    wrench.rmdirRecursive(this.path);
}

/**
 * Add data to this particular metric
 *
 * By default, the average will be used to populate any missing fields
 */
metric.prototype.add = function(time, count, avg, min, max, pctile) {
    /* Invoke our data callbacks */
    this.datacbs.invoke(time, count, avg, min, max, pctile);
    /* Tack this onto the end of our data */
    this.data.push([time, count, avg, min, max, pctile]);
    /* If we have a parent, we should add that data to the parent */
    if (this.parent) {
        this.parent.add(time, count, avg, min, max, pctile);
    }
}

/**
 * Get all the data points for the provided range [start, end] asynchronously
 *
 * This function returns an array of arrays, whose indices correspond to 
 * time, count, avg, min, max and pctile
 */
metric.prototype.get = function(start, end, cb) {
    /* Read in all the necessary data, including whatever's in memory */
    var me = this;
    process.nextTick(function() {
        /* The results we'll send back to the user */
        var results = [];
        
        /* Go through all of our timestamps and at least identify any files that
         * we'll need to read from */
        var paths = [];
        for (var i = 0; i < me.timestamps.length; ++i) {
            /* If we've passed the end, we should stop. We should also check to 
             * make sure the last interval was included. If there is no previous 
             * path, then we have no matches. */
            if (me.timestamps[i] > end) {
                if (i > 0) {
                    var p = path.resolve(me.path, String(me.timestamps[i-1]));
                    if (paths.length === 0 || paths[paths.length - 1] !== p) {
                        paths.push(p);
                    }
                }
                break;
            }
            
            /* Assume that the timestamps are sorted. After all, they're 
             * supposed to be. */
            if (me.timestamps[i] >= start) {
                /* If we're still looking, and the timestamp is after start, 
                 * then it should definitely be included */
                paths.push(path.resolve(me.path, String(me.timestamps[i])));
                continue;
            }
        }
        
        /* Also iterate through our current data buffer and make sure that 
         * we return any matching data */
        for (var i in me.data) {
            if (me.data[i][0] <= end && me.data[i][0] >= start) {
                results.push(me.data[i]);
            }
        }
        
        if (paths.length == 0) {
            results.sort(function(a, b) { return a[0] - b[0]; });
            cb(results);
        } else {
            async.map(paths, me.read, function(err, res) {
                /* Surely there's something more efficient */
                for (var i in res) {
                    var o = res[i];
                    for (var j in o) {
                        if (o[j][0] <= end && o[j][0] >= start) {
                            results.push(o[j]);
                        }
                    }
                }
                
                /* And sort them */
                results.sort(function(a, b) { return a[0] - b[0]; });
                cb(results);
            });
        }
    });
}

/**
 * Read in the provided time slice
 *
 * Returns data as it would be returned from `get` from the provided path
 */
metric.prototype.read = function(path, cb) {
    fs.readFile(path, function (err, data) {
        /* If there was an error... */
        if (err) {
            return cb(err);
        }
        
        /* How many items are we expecting to read? */
        var count   = Math.floor(data.length / 24);
        var results = new Array(count);
        for (var i = 0; i < count; ++i) {
            results[i] = [
                data.readUInt32BE(i * 24     ), // Timestamp
                data.readUInt32BE(i * 24 + 4 ), // Count
                data.readFloatBE( i * 24 + 8 ), // Avg
                data.readFloatBE( i * 24 + 12), // Min
                data.readFloatBE( i * 24 + 16), // Max
                data.readFloatBE( i * 24 + 20)  // Percentile
            ];
        }
        cb(null, results);
    });
}

/**
 * Flush in-memory data to disk
 *
 * This can be called at any time, and will run asynchronously. Upon completion,
 * it will invoke any provided callback
 */
metric.prototype.flush = function(cb) {
    /* We're going to need `this` bound to a variable */
    var me = this;
    
    /* First, if there's no data in the buffer, we should just bail out early 
     * and save ourselved the trouble. */
    if (this.data.length == 0) {
        if (cb) { process.nextTick(function() { cb(me); }); }
        return;
    }
    
    /* Sort the data that we're going to dump */
    this.data.sort(function(a, b) { return a[0] - b[0]; });
    
    /* The file path to use */
    var p = null;
        
    /* If there is data, than we should save that to a new variable and replace 
     * the data object with an empty one. */
    var data = this.data;
    this.data = [];
    
    /* File operations in node deal in buffers, so let's make a buffer. Each 
     * record will be 24 bytes */
    var buf = new Buffer(data.length * 24);
    for (var i in data) {
        buf.writeUInt32BE(data[i][0], i * 24     ); // Timestamp
        buf.writeUInt32BE(data[i][1], i * 24 + 4 ); // Count
        buf.writeFloatBE( data[i][2], i * 24 + 8 ); // Avg
        buf.writeFloatBE( data[i][3], i * 24 + 12); // Min
        buf.writeFloatBE( data[i][4], i * 24 + 16); // Max
        buf.writeFloatBE( data[i][5], i * 24 + 20); // Percentile
    }
    
    /* Find all the files that we have to write to, and the buffer offset and 
     * lengths to use for each, and the position in the file to write that to. 
     * This is the index of the data point that we're next supposed to deal */
    var index      = 0;
    var operations = []
    async.whilst(
        function() {
            if (index < data.length) {
                /* Update the current path to use */
                if (p !== null) {
                    p = path.resolve(me.path, String(data[index][0]));
                    me.timestamps.push(data[index][0]);
                } else {
                    /* Let's see what file we should be writing to. If there are 
                     * currently no timestamps, then we use the minimum time for 
                     * the data. Otherwise, we * append to the most recent 
                     * timestamp */
                     if (me.timestamps.length == 0) {
                         p = path.resolve(me.path, String(data[0][0]));
                         me.timestamps.push(data[0][0]);
                     } else {
                         p = path.resolve(me.path, String(
                             me.timestamps[me.timestamps.length-1]));
                     }
                }
                return true;
            }
            return false;
        },
        function(callback) {
            fs.stat(p, function(err, stat) {
                /* How big the file currently is. If it doesn't exist, it'll 
                 * throw an error, in which case we haven't written anything */
                var size = 0;
                if (err) { size = 0; } else { size = stat.size }
                var remaining = Math.floor((maxSliceSize - size) / 24);
                /* Remaining can't be more than the number of remaining data 
                 * points */
                remaining = Math.min(remaining, data.length - index);
                /* Add this to the list of things to do */
                operations.push({
                    path    : p,
                    offset  : index * 24,
                    length  : remaining * 24,
                    position: size
                });
                index += remaining;
                callback(null);
            });
        }, function(err) {
            /* Re-sort the timestamps */
            me.timestamps.sort(function(a, b) { return a - b; });
            /* The condition has been met */
            async.map(operations, function(op, callback) {
                /* Open the file, write into it, call it a day */
                fs.open(op['path'], 'a', function(err, fd) {
                    fs.write(fd, buf, op['offset'], op['length'],
                        op['position'], callback);
                })
            }, function(err, results) {
                /* Finished with all of this */
                if (cb) {
                    process.nextTick(function() { cb(me); });
                }
            });
        }
    )
}

/**
 * Rotate all the files that need to be rotated out
 *
 * Any files that are too old should be deleted, and all other files should be
 * at their configured resolution by the time this function completes
 */
metric.prototype.rotate = function(cb) {
    if (cb) {
        var me = this;
        process.nextTick(function() {
            cb(me);
        });
    }
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