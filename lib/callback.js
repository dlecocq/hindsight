/* A reusable mechanism for keeping track of a number of callbacks and 
 * subscriptions, with support for canceling /specific/ callbacks */

var uuid = require('node-uuid');

/**
 * Subscription class
 *
 * Although the subscription class is not meant to be directly instantiated by 
 * the user, it is returned on a number of occasions */
function subscription(id, cb) {
    this.id  = id;
    this.cb  = cb;
}

/**
 * Deregister this subscription
 */
subscription.prototype.off = function() {
    /* Turn this callback off */
    this.cb.off(this.id);
}

/**
 * Callback class
 *
 * The callback class is a container for a number of callback functions. These 
 * functions are returned to the user in the form of a subscription object which
 * can later be used to cancel the subscription. It hands out unique ids to 
 * these subscriptions to ease their unregistration later
 */
function callback() {
    this.callbacks = {};
}

/**
 * Add the function f as a callback, and return the subscription object for it
 */
callback.prototype.add = function(f) {
    var id = uuid.v4();
    this.callbacks[id] = f;
    return new subscription(id, this);
}

/**
 * Invoke any and all callbacks registered, with the provided data
 */
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

/**
 * Deregister the provided id
 */
callback.prototype.off = function(id) {
    delete this.callbacks[id];
}

exports.callbacks = callback;