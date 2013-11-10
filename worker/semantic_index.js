/**
 * jsonalyzer JavaScript analysis plugin index
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var handler /*: require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker")*/;
var scopeAnalyzer = require('plugins/c9.ide.language.javascript/scope_analyzer');
var workerUtil = require("plugins/c9.ide.language/worker_util");
var KIND_PACKAGE = scopeAnalyzer.KIND_PACKAGE;
var KIND_HIDDEN = scopeAnalyzer.KIND_HIDDEN;
var GC_INTERVAL = 5 * 60 * 1000;

var index = module.exports;

var analyzedFiles = {};
// var knownPathCache = {};
var pathGuids = {};
var accessedSinceGC = {};
var summaries = {};
    
index.init = function(_handler) {
    handler = _handler;
    
    var _self = this;
    setInterval(function() {
        _self.gc();
    }, GC_INTERVAL);
};

// getAssociatedSummaries
index.getAny = function(guidsOrPaths) {
    return guidsOrPaths.map(index.get.bind(index)).filter(function(i) {
        return !!i;
    });
};

index.get = function(guidOrPath) {
    accessedSinceGC["_" + guidOrPath] = true;
    var guid = pathGuids["_" + guidOrPath];
    return guid ? summaries["_" + guid] : summaries["_" + guidOrPath];
};

index.set = function(path, guidPrefix, entry) {
    var guid = entry.guid || guidPrefix + path;
    entry.path = path;
    pathGuids["_" + path] = guid;
    summaries["_" + guid] = entry;
};

index.setBroken = function(path, reason) {
    var guid = "broken:" + path;
    pathGuids["_" + path] = guid;
    summaries["_" + guid] = {
        broken: reason || "broken"
    };
};

/**
 * Flatten index entries into a single entry object.
 *
 * @param entry
 */
index.flattenIndexEntry = function(entry, result) {
    if (!entry)
        return null;
    result = result || {};
    
    var that = this;
    if (Array.isArray(entry)) {
        entry.forEach(function(e) { that.flattenIndexEntry(e, result)});
        return result;
    }
    if (!entry || !entry.properties)
        return result;
    
    for (var p in entry.properties) {
        if (!result[p])
            result[p] = entry.properties[p];
        else
            result[p] = result[p].concat(entry.properties[p]);
        this.flattenIndexEntry(entry.properties[p], result);
    }
    
    return result;
};

index.removeByPath = function(path) {
    var guid = pathGuids["_" + path];
    if (!guid)
        return;

    delete analyzedFiles["_" + path];
    delete pathGuids["_" + guid];
    delete summaries[guid];
};

index.removeByPathPrefix = function(pathPrefixes) {
    for (var upath in pathGuids) {
        var matches = pathPrefixes.filter(function(p) {
            return upath.indexOf(p) === 1;
        });
        if (matches.length === 0)
            continue;
        
        delete summaries["_" + pathGuids[upath]];
        delete pathGuids[upath];
    }
};
    
/**
 * Garbage collect the index. Called automatically in an interval.
 * @internal
 */
index.gc = function() {
    var openFiles = workerUtil.getOpenFiles();
    for (var upath in pathGuids) {
        var guid = pathGuids[upath];
        
        if (accessedSinceGC[upath])
            continue;
        if (accessedSinceGC["_" + guid] || openFiles.indexOf(upath.substr(1)) > -1)
            continue;
        
        delete pathGuids[upath];
        delete summaries["_" + guid];
    }
    accessedSinceGC = {};
};

index.clear = function() {
    pathGuids = {};
    summaries = {};
    accessedSinceGC = {};
};

index.$clearAccessedSinceGC = function() {
    accessedSinceGC = {};
};

});