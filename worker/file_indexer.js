/**
 * jsonalyzer file indexer
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var indexer = module.exports;
var index = require("./semantic_index");
var worker = require("plugins/c9.ide.language/worker");
var workerUtil = require("plugins/c9.ide.language/worker_util");
var assert = require("c9/assert");
var handler;

var QUEUE_DELAY = 5 * 1000;
var QUEUE_MAX_TIME = 120 * 1000;

var queueSet = {};
var queueTimer;
var queueWatcher;
var isJobActive = false;
var queueCallbacks = [];

indexer.init = function(_handler) {
    handler = _handler;
};

/**
 * Analyze a single file.
 * Check with the index first whether analysis is required.
 * 
 * @param {String} path
 * @param {String} docValue
 * @param {Object} ast                  The AST, if available
 * @param {Object} options
 * @param {String} options.service      The service this is triggered for, e.g. "complete" or "outline"
 * @param {Function} callback
 * @param {String} callback.err
 * @param {Object} callback.result
 */
indexer.analyzeCurrent = function(path, docValue, ast, options, callback) {
    var entry = index.get(path);
    if (entry && !worker.$lastWorker.scheduledUpdate)
        return callback(null, entry, index.getImports(path), entry.markers);
    
    var plugin = handler.getHandlerFor(path);
    return plugin.analyzeCurrent(path, docValue, ast, options, function(err, indexEntry, markers) {
        if (err) {
            index.setBroken(path, err);
            return callback(err);
        }
        assert(indexEntry || markers, "jsonalyzer handler must return a summary and/or markers");
        
        indexEntry = indexEntry || index.get(path) || {};
        markers = indexEntry.markers = indexEntry.markers || markers;
        
        index.set(path, plugin.guidName + ":", indexEntry);
        
        plugin.findImports(path, docValue, ast, options, function(err, imports) {
            if (err) {
                console.error("[jsonalyzer] error finding imports for " + path + ": " + err);
                imports = [];
            }
            imports = imports.filter(function(i) {
                // Don't return self or unanalyzeable imports
                return i !== path;
            });
            index.set(path, plugin.guidName + ":", indexEntry, imports);
            callback(null, indexEntry, imports, markers);
        });
    });
};

/**
 * Enqueue unanalyzed files for analysis.
 * Check with the index first whether analysis is required.
 * 
 * @param {String[]} paths
 * @param {Boolean} [now]
 * @param {Function} callback  The callback; check with the index for results
 */
var enqueue = indexer.analyzeOthers = function(paths, now, callback) {
    if (callback)
        queueCallbacks.push(callback);
    
    for (var i = 0; i < paths.length; i++) {
        queueSet["_" + paths[i]] = paths[i];
    }
    
    if (now)
        return consumeQueue();
    
    if (!queueTimer)
        queueTimer = setTimeout(consumeQueue, QUEUE_DELAY);
};

function consumeQueue() {
    queueTimer = null;
    if (isJobActive)
        return;
    isJobActive = true;
    updateQueueWatcher();
    
    var paths = [];
    for (var item in queueSet) {
        if (index.get(queueSet[item]))
            continue;
        paths.push(queueSet[item]);
    }
    queueSet = {};
    
    var pathsPerPlugin = {};
    for (var i = 0; i < paths.length; i++) {
        var plugin = handler.getHandlerFor(paths[i]);
        if (!plugin) // path added when not fully initialized yet
            continue;
        if (!pathsPerPlugin[plugin.guidName]) {
            pathsPerPlugin[plugin.guidName] = {
                plugin: plugin,
                paths: []
            };
        }
        pathsPerPlugin[plugin.guidName].paths.push(paths[i]);
    }
    
    workerUtil.asyncForEach(
        Object.keys(pathsPerPlugin),
        function(guidName, next) {
            var task = pathsPerPlugin[guidName];
            
            // Make sure we haven't analyzed these yet
            task.paths = task.paths.filter(function(path) {
                return !index.get(path);
            });
                 
            task.plugin.analyzeOthers(task.paths, {}, function(errs, results) {
                assert(!errs || Array.isArray(errs));
                updateQueueWatcher();
                
                // Help debuggers
                var pathsCopy = task.paths.slice();
                var resultsCopy = (results || []).slice();
                var errsCopy = (errs || []).slice();
                
                while (pathsCopy.length) {
                    var err = errsCopy.pop();
                    var path = pathsCopy.pop();
                    var result = resultsCopy.pop();
                    if (err) {
                        index.setBroken(path, err);
                        console.log("[jsonalyzer] Warning: failed to import " + path + ": " + err);
                        continue;
                    }
                    assert(result);
                    index.set(path, guidName + ":", result);
                }
                
                next();
            });
        },
        done
    );
    
    function done() {
        isJobActive = false;
        clearTimeout(queueWatcher);
        var callbacks = queueCallbacks;
        queueCallbacks = [];
        callbacks.forEach(function(callback) { callback() });
    }
    
    function updateQueueWatcher() {
        clearTimeout(queueWatcher);
        queueWatcher = setTimeout(function() {
            isJobActive = false;
            console.error("Warning: file_indexer plugin timeout, restarting");
            consumeQueue();
        }, QUEUE_MAX_TIME);
    }
}

});

