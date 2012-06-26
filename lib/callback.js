/* A reusable mechanism for keeping track of a number of callbacks and 
 * subscriptions, with support for canceling /specific/ callbacks */

var uuid = require('node-uuid');

function subscription(id, cb) {
    this.id  = id;
    this.cb  = cb;
}

subscription.prototype.off = function() {
    /* Turn this callback off */
    this.cb.off(this.id);
}

function callback() {
    this.callbacks = {};
}

callback.prototype.add = function(f) {
    var id = uuid.v4();
    this.callbacks[id] = f;
    return new subscription(id, this);
}

callback.prototype.invoke = function() {
    var args = arguments;
    var me   = this;
    for (var id in this.callbacks) {
        try {
            var cb   = this.callbacks[id];
            process.nextTick(function() {
                cb.apply(me, args);
            });
        } catch(e) {
            console.log('Callback error: ' + e);
        }
    }
}

callback.prototype.off = function(id) {
    delete this.callbacks[id];
}

exports.callbacks = callback;