/**
 * jsonalyzer PHP analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer;
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var ctagsUtil = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util");

var handler = module.exports = Object.create(PluginBase);

var TAGS = [
    { regex: /abstract class ([^ ]*)/g, kind: "package" },
    { regex: /interface ([^ ]*)/g, kind: "package" },
    {
        regex: /(?:public |static |abstract |protected |private )*function ([^ (]*)/g,
        kind: "method"
    },
    {
        regex: new RegExp(
            "include\\("
            + "(?:\\$\\w+(?:\\[[\\w']+\\])?)?"
            + "(?:\\s*\\.\\s*)?",
            "g"
        ),
        kind: "import"
    }
];
var GUESS_FARGS = true;
var EXTRACT_DOCS = true;

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerHandler(this, "php", ["php"], ["php"]);
};

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    if (doc === "")
        return callback(null, {});
        
    if (doc.length > jsonalyzer.getMaxFileSizeSupported())
        return callback();
    
    var lines = doc.split(/\n/);
    var result = {
        doc: ctagsUtil.extractDocumentationAtRow(lines, 0),
        properties: {}
    };
    TAGS.forEach(function(tag) {
        if (tag.kind === "import")
            return;
        ctagsUtil.findMatchingTags(
            lines, doc, tag, GUESS_FARGS, EXTRACT_DOCS, result.properties);
    });
    callback(null, result);
};

handler.analyzeOthers = handler.analyzeCurrentAll;

handler.findImports = function(path, doc, ast, callback) {
    // TODO: get open files + guess imports
    require("./jsonalyzer_ctags").findImports(path, doc, ast, callback);
};


});