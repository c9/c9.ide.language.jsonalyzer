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
    
    // HELPERS (AUTOMATICALLY SET)
    
    guidName: null,
    
    guidNameRegex: null,
    
    supportedLanguages: [],
    
    supportedExtensions: "",
    
    // ABSTRACT METHODS
    
    /**
     * Initializes the plugin, and calls
     * handler.registerHandler()
     * 
     * Must be implemented by inheritors.
     */
    init: function(handler) {
        throw new Error("init() not implemented by inheritor");
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
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.result
     */
    findImports: function(path, value, ast, callback) {
        callback();
    },
    
    /**
     * Analyze the current file.
     * 
     * Should be overridden by inheritors.
     * 
     * @param {String} path
     * @param {String} value
     * @param {Object} ast                         The AST, if available
     * @param {Object} options
     * @param {Boolean} options.isSave             Triggered by a save
     * @param {Boolean} options.isComplete         Triggered by completion
     * @param {Boolean} options.isJumpToDefinition Triggered by jump to definition
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.result
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
     * @param {Function} callback
     * @param {String[]} callback.errs
     * @param {String} callback.result
     */
    analyzeOthers: function(paths, callback) {
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
    analyzeCurrentAll: function(paths, callback) {
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
    },
    
};

});