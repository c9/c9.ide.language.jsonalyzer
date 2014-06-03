// Supported

module.exports.init = function(options, callback) {
    callback();
};

// Unsupported

module.exports.findImports = function(path, value, ast, options, callback) {
    return callback("Unavailable in server context: architect_resolver_worker.findImports");
};