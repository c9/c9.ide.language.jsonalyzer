/**
 * jsonalyzer PHP analysis
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker");
var infer = require("plugins/c9.ide.language.javascript.infer/infer");
var path = require("plugins/c9.ide.language.javascript.infer/path");
var jumpToDefFallback = require("plugins/c9.ide.language.jsonalyzer/worker/jumptodef_generic");
var index = require("plugins/c9.ide.language.jsonalyzer/worker/semantic_index");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
require("treehugger/traverse"); // add traversal methods

var jsinferJumpToDef;

var handler = module.exports = Object.create(PluginBase);

var summaries = {};

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerPlugin(this, "php", ["php"], ["php"]);
};

handler.onReceivedSummaries = function(kind, summaries) {
    if (kind === this.KIND_DEFAULT)
        summaries = summaries;
};

handler.findImports = function(doc, ast, callback) {
    callback(this.findImportsSync(ast));
};

/**
 * Get a list of all modules imported from
 * require() statements in an AST.
 *
 * @param excludeAnalyzed  if true, don't include modules that were already analyzed
 */
handler.findImportsSync = function(ast) {
    var basePath = path.getBasePath(jsonalyzer.path, jsonalyzer.workspaceDir);
    // TODO
    return [];
};

});
