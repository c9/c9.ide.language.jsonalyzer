/*
 * jsonalyzer JavaScript analysis plugin base class
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var asyncForEach = require("plugins/c9.ide.language/worker").asyncForEach;
var workerUtil = require("plugins/c9.ide.language/worker_util");

/**
 * The jsonalyzer analysis plugin base class.
 * 
 * @ignore Experimental.
 * 
 * @class language.jsonalyzer_base_handler
 */
module.exports = {

    // ABSTRACT MEMBERS

    /**
     * The languages this handler applies to,
     * e.g. ["php"].
     * 
     * Must be overridden by inheritors.
     */
    elanguages: [],
    
    /**
     * The extensions this handler applies to,
     * e.g. ["php"]. Used when the language
     * of a file cannot be determined.
     * 
     * Must be overridden by inheritors.
     */
    extensions: [],
    
    /**
     * The maximum interval between calls for server-side handlers.
     * 
     * Should be overridden by server-side inheritors.
     */
    maxCallInterval: 2000,
    
    // CONSTANTS
    
    CALL_INTERVAL_MIN: 500,
    
    CALL_INTERVAL_BASIC: 1200,
    
    // ABSTRACT MEMBERS
    
    /**
     * Initializes this handler.
     * 
     * May be overridden by inheritors.
     *
     * @param {Object} options  The options passed while registering this handler.
     * @param {Function} callback
     * @param {String} callback.err
     */
    init: function(options, callback) {
        callback();
    },

    /**
     * Find all imports in a file.
     * Likely to be called each time analyzeCurrent is called.
     * 
     * May be overridden by inheritors.
     * 
     * @param {String} path
     * @param {String} value
     * @param {Object} ast                         The AST, if available
     * @param {Object} options
     * @param {String} options.service      The service this is triggered for, e.g. "complete" or "outline"
     * @param {String} options.isSave       Whether this has been triggered by a save
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.result
     */
    findImports: function(path, value, ast, options, callback) {
        callback();
    },
    
    /**
     * Analyze the current file.
     * 
     * Should be overridden by inheritors.
     * 
     * @param {String} path
     * @param {String} value
     * @param {Object} ast                  The AST, if available
     * @param {Object} options
     * @param {String} options.service      The service this is triggered for, e.g. "complete" or "outline"
     * @param {String} options.isSave       Whether this has been triggered by a save
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.indexEntry
     * @param {Object} callback.markers
     */
    analyzeCurrent: function(path, value, ast, options, callback) {
        callback();
    },
    
    /**
     * Analyze the other/imported files.
     * 
     * May not be overridden by inheritors.
     * 
     * @param {String} paths
     * @param {Object} options
     * @param {Function} callback
     * @param {String[]} callback.errs
     * @param {String} callback.result
     */
    analyzeOthers: function(paths, options, callback) {
        callback();
    },
    
    /**
     * @internal Design to be revisited.
     */
    analyzeWorkspaceRoot: function(callback) {
        callback();
    },
    
    // UTILITY
    
    /**
     * Utility function to call analyzeCurrent on a list of paths.
     * 
     * Should not be overridden by inheritors.
     */
    analyzeCurrentAll: function(paths, options, callback) {
        var errs = [];
        var results = [];
        var _self = this;
        asyncForEach(
            paths,
            function(path, next) {
                workerUtil.readFile(path, { unsaved: true }, function(err, doc) {
                    if (err) {
                        errs.push(err);
                        results.push(null);
                        return next();
                    }
                    
                    _self.analyzeCurrent(path, doc, null, options, function(err, result) {
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
    },
    
};

});