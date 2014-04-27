// Supported

module.exports.init = function() {};

// Unsupported

["findImports"].forEach(function(p) {
    Object.defineProperty(module.exports, p, {
        get: function() {
            throw new Error('Unavailable in server context: architect_resolver_worker.' + p);
        }
    });
});