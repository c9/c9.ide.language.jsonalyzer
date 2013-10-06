/**
 * jsonalyzer JavaScript analysis plugin index
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer /*: require("ext/jsonalyzer/worker/jsonalyzer_worker")*/;
var KIND_PACKAGE = require('ext/jslanguage/scope_analyzer').KIND_PACKAGE;
var KIND_HIDDEN = require('ext/jslanguage/scope_analyzer').KIND_HIDDEN;
var GC_INTERVAL = 10 * 60 * 1000;

module.exports = {
    
    analyzedModules: {},
    
    knownPathCache: {},
    
    shortSummaries: null,
    
    longSummaries: {},
    
    init: function(jsonalyzer_worker) {
        jsonalyzer = jsonalyzer_worker;
        
        var _self = this;
        setInterval(function() {
            _self.gc();
        }, GC_INTERVAL);
    },

    getAssociatedSummaries: function(imports) {
        var results = [];
        for (var i = 0; i < imports.length; i++) {
            var guid = this.analyzedModules["_" + imports[i]];
            if (guid && guid !== jsonalyzer.UNKNOWN_GUID)
                results.push(this.longSummaries[guid]);
        }
        return results;
    },
    
    removeModules: function(summary, removals, useUnderscores) {
        if (!summary)
            return summary;
        for (var i = 0; i < removals.length; i++) {
            var id = useUnderscores ? "_" + removals[i] : removals[i];
            if (summary[id])
                delete summary[id];
        }
        return summary;
    },
    
    parsePackages: function(summaryText, isParanoidResult, callback) {
        var result;
        try {
            result = JSON.parse(summaryText);
        } catch (err) {
            return callback(err);
        }
        if (result.paranoidSkipped)
            return callback(null, this.shortSummaries);
        if (jsonalyzer.DEBUG)
            console.log("[jsonalyzer] fetched tree " + (isParanoidResult ? "(p)" : ""));
        for (var p in result) {
            if (result.hasOwnProperty(p))
                this.knownPathCache["_" + result[p].path] = true;
        }
        // Remove modules for which we have detailed summaries
        result = this.removeModules(result, jsonalyzer.toValueArray(this.analyzedModules));
        return callback(null, result);
    },
    
    parseModules: function(toShow, toLoad, summaryText, stderr, results, callback) {
        var summary;
        try {
            summary = JSON.parse(summaryText);
        } catch (err) {
            return callback(err);
        }
        
        for (var p in summary) {
            if (!summary.hasOwnProperty(p))
                continue;
            this.analyzedModules["_" + summary[p].path] = summary[p].guid;
            this.analyzedModules["_" + summary[p].guid] = summary[p].guid;
            results[summary[p].guid] = summary[p];
            if (jsonalyzer.DEBUG)
                console.log("[jsonalyzer] fetched", summary[p].guid);
        }
        
        // Remove modules for which we have detailed summaries
        this.shortSummaries = this.removeModules(this.shortSummaries, jsonalyzer.toValueArray(this.analyzedModules));
        
        return callback(null, results);
    },
    
    gc: function() {
        this.analyzedModules = {};
        // TODO: optimize - don't throw away current file's require summaries?
        for (var p in this.longSummaries) {
            if (!this.longSummaries.hasOwnProperty(p))
                return;
            var summary = this.longSummaries[p];
            // Restore short summary in package summary collection
            this.shortSummaries[p] = {
                guid: summary.guid,
                path: summary.path,
                kind: KIND_PACKAGE
            };
        }
        this.longSummaries = {};
        jsonalyzer.isEagerAnalysis = false;
    }
};

});