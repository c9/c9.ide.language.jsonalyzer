// Supported

module.exports.asyncForEach = require("async").forEachSeries;

// Unsupported

["$lastWorker", "sender"].forEach(function(p) {
    Object.defineProperty(module.exports, p, {
        get: function() {
            throw new Error('Unavailable in server context: worker.' + p);
        }
    });
});