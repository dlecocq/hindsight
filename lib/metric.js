var fs     = require('fs');
var path   = require('path');
var wrench = require('wrench');

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
}

exports.metric = metric;