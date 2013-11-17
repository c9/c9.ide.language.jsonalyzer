/**
 * jsonalyzer CTAGS-based analysis
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var index = require("plugins/c9.ide.language.jsonalyzer/worker/semantic_index");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var ctags = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_ex");
var asyncForEach = require("plugins/c9.ide.language/worker").asyncForEach;
var workerUtil = require("plugins/c9.ide.language/worker_util");

var handler = module.exports = Object.create(PluginBase);

var EXTENSION_GROUPS = ctags.LANGUAGES.map(function(l) { return l.extensions; });
var IDLE_TIME = 50;

handler.init = function(theHandler) {
    handler = theHandler;
    var extensions = Array.prototype.concat.apply([], EXTENSION_GROUPS);
    handler.registerHandler(this, "ctags", [".*"], extensions);
};

handler.findImports = function(path, doc, ast, callback) {
    var openFiles = workerUtil.getOpenFiles();
    var extension = getExtension(path);
    var supported = getCompatibleExtensions(extension);
    var imports = openFiles.filter(function(path) {
        return supported.indexOf(getExtension(path)) > -1;
    });
    callback(null, imports);
};

function getExtension(path) {
    return path.match(/[^\.]*$/)[0];
}

/**
 * Get an array of compatible extensions, e.g. ["js", "html"] for "js".
 */
function getCompatibleExtensions(extension) {
    for (var i = 0; i < EXTENSION_GROUPS.length; i++) {
        if (EXTENSION_GROUPS[i].indexOf(extension) > -1)
            return EXTENSION_GROUPS[i];
    }
    return [extension];
}

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    if (doc === "")
        return callback(null, {});
        
    if (doc.length > handler.getMaxFileSizeSupported())
        return callback();

    // Let's not slow down completion, since other handlers
    // likely give better results anyway. We'll just use the last analysis.
    // And also, we don't care about saves, just about changes
    if ((options.isComplete || options.isSave) && index.get(path))
        return callback(null, index.get(path));
    
    ctags.analyze(path, doc, callback);
};

handler.analyzeOthers = function(paths, callback) {
    var errs = [];
    var results = [];
    var _self = this;
    asyncForEach(
        paths,
        function(path, next) {
            workerUtil.readFile(path, function(err, doc) {
                if (err) {
                    errs.push(err);
                    results.push(null);
                    return next();
                }
                
                _self.analyzeCurrent(path, doc, null, {}, function(err, result) {
                    errs.push(err);
                    results.push(result);
                    next();
                });
            });
        },
        function() {
            callback(errs, results);
        }
    );
};

});
