/**
 * jsonalyzer shell analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var ctagsUtil = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util");

var TAGS = [
    { regex: /(?:^|\n)\s*([A-Za-z0-9_]+)\(\)/g, kind: "method" },
    { regex: /(?:^|\n)\s*(\.|source)\s+([A-Za-z0-9_]+)/g, kind: "import" }
];
var GUESS_FARGS = false;
var EXTRACT_DOCS = true;

var handler = module.exports = Object.create(PluginBase);
var lastMarkers;

handler.languages = ["sh"];

handler.extensions = ["sh"];

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    if (doc === "")
        return callback(null, {});
        
    if (doc.length > jsonalyzer.getMaxFileSizeSupported())
        return callback(null, {});
    
    var results = {};
    TAGS.forEach(function(tag) {
        if (tag.kind === "import")
            return;
        ctagsUtil.findMatchingTags(
            path, doc, tag, GUESS_FARGS, EXTRACT_DOCS, results);
    });
    
    if (options.service)
        return done();
    
    var serverHandler = jsonalyzer.getServerHandlerFor(path, "sh");
    if (!serverHandler)
        return done();
    
    serverHandler.analyzeCurrent(path, doc, ast, options, function(err, summary, markers) {
        if (err)
            console.error(err.stack || err);
        lastMarkers = markers;
        done();
    });
    
    function done() {
        callback(null, { properties: results }, lastMarkers);
    }
};

handler.analyzeOthers = handler.analyzeCurrentAll;

handler.findImports = function(path, doc, ast, options, callback) {
    callback(null, ctagsUtil.findMatchingOpenFiles(path));
};


});