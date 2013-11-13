/*
 * jsonalyzer JavaScript analysis plugin base class
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

/**
 * The jsonalyzer analysis plugin base class.
 * 
 * @ignore Experimental.
 * 
 * @class language.jsonalyzer_base_handler
 */
module.exports = {
    
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
     * 
     * @param {String} path
     * @param {String} doc
     * @param {Object} ast                         The AST, if available
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.result
     */
    findImports: function(path, doc, ast, callback) {
        callback();
    },
    
    /**
     * Analyze the current file.
     * 
     * @param {String} path
     * @param {String} doc
     * @param {Object} ast                         The AST, if available
     * @param {Object} options
     * @param {Boolean} options.isSave             Triggered by a save
     * @param {Boolean} options.isComplete         Triggered by completion
     * @param {Boolean} options.isJumpToDefinition Triggered by jump to definition
     * @param {Function} callback
     * @param {String} callback.err
     * @param {Object} callback.result
     */
    analyzeCurrent: function(path, doc, ast, options, callback) {
        callback();
    },
    
    /**
     * Analyze the other/imported files.
     * 
     * @param {String} paths
     * @param {String} doc
     * @param {Object} ast  The AST, if available
     * @param {Function} callback
     * @param {String[]} callback.errs
     * @param {String} callback.result
     */
    analyzeOthers: function(paths, callback) {
        callback();
    },
    
    analyzeWorkspaceRoot: function(callback) {
        callback();
    },
    
    // HELPERS (AUTOMATICALLY SET ON REGISTRATION)
    
    guidName: null,
    
    guidNameRegex: null,
    
    supportedLanguages: [],
    
    supportedExtensions: ""
    
};

});