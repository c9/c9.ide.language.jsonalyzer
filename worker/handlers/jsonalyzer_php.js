/**
 * jsonalyzer PHP analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker");
var path = require("plugins/c9.ide.language.javascript.infer/path");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
require("treehugger/traverse"); // add traversal methods

var handler = module.exports = Object.create(PluginBase);

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerHandler(this, "php", ["php"], ["php"]);
};

handler.findImports = function(doc, ast, callback) {
    var basePath = path.getBasePath(jsonalyzer.path, jsonalyzer.workspaceDir);
    // TODO: get open files + guess imports
    callback(this.findImportsSync(ast));
};


});