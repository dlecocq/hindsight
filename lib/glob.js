function glob(s) {
    /* Turn the provided string into a glob */
    this.re = new RegExp('^' + s.replace(/\*\*/g, '.+').replace(/\*/g,'[^\/]+')
        + '$');
}

glob.prototype.match = function(s) {
    return this.re.test(s);
}

exports.glob = glob;