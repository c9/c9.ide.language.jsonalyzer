/**
 * jsonalyzer JavaScript analysis plugin base class
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

module.exports = {
    
    // ABSTRACT METHODS
    
    init: function(jsonalyzer_worker) {
        
    },
    
    findImports: function(doc, ast, callback) {
        callback(new Error("findImports() not implemented for this plugin"), null);
    },
    
    onReceivedSummaries: function(kind, summaries) {
        throw new Error("onReceivedSummaries() not implemented for this plugin");
    },

    // HELPERS / AUTOMATICALLY SET ON REGISTRATION
    
    guidName: null,
    
    guidNameRegex: null,
    
    supportedLanguages: [],
    
    supportedExtensions: "",
    
    isOneExtensionSupported: function(filenames) {
        for (var i = 0; i < filenames.length; i++) {
            if (filenames[i].match(this.supportedExtensions))
                return true;
        }
        return false;
    }
    
};

});