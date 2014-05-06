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

var TAGS = [
    { regex: /(?:^|\n)\s*(?:abstract\s+)?class ([^ ]*)/g, kind: "package" },
    { regex: /(?:^|\n)\s*interface ([^ ]*)/g, kind: "package" },
    {
        regex: /(?:^|\n)\s*(?:public\s+|static\s+|abstract\s+|protected\s+|private\s+)*function ([^ (]*)/g,
        kind: "method"
    },
    {
        regex: new RegExp(
            "(?:^|\n)\s*include\\("
            + "(?:\\$\\w+(?:\\[[\\w']+\\])?)?"
            + "(?:\\s*\\.\\s*)?",
            "g"
        ),
        kind: "import"
    }
];
var GUESS_FARGS = true;
var EXTRACT_DOCS = true;
var LANGUAGES = ["php"];
var EXTENSIONS = ["php"];

var handler = module.exports = Object.create(PluginBase);

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerHandler(this, LANGUAGES[0], LANGUAGES, EXTENSIONS);
};

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    if (doc === "")
        return callback(null, {});
        
    if (doc.length > jsonalyzer.getMaxFileSizeSupported())
        return callback(null, {});
    
    var results = {};
    TAGS.forEach(function(tag) {
        if (tag.kind === "import")
            return;
        ctagsUtil.findMatchingTags(path, doc, tag, GUESS_FARGS, EXTRACT_DOCS, results);
    });
    callback(null, { properties: results });
};

handler.analyzeOthers = handler.analyzeCurrentAll;

handler.findImports = function(path, doc, ast, callback) {
    // TODO: get open files + guess imports
    callback(null, ctagsUtil.findMatchingOpenFiles(path));
};


});