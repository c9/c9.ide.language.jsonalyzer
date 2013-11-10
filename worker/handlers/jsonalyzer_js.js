/**
 * jsonalyzer JavaScript analysis
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker");
var infer = require("plugins/c9.ide.language.javascript.infer/infer");
var path = require("plugins/c9.ide.language.javascript.infer/path");
var jumpToDefFallback = require("plugins/c9.ide.language.jsonalyzer/worker/jumptodef_generic");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
require("treehugger/traverse"); // add traversal methods

var jsinferJumpToDef;

var handler = module.exports = Object.create(PluginBase);

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerPlugin(this, "js", ["javascript"], ["js", "json"]);
    
    // HACK: Make analyzer work with old server version
    this.guidNameRegex = /^(js(_p)?|project):/;
    
    // Patch the jsinfer jumptodef
    var plugin = require("plugins/c9.ide.language.javascript.infer/infer_jumptodef");
    jsinferJumpToDef = plugin.jumpToDefinition.bind(plugin);
    plugin.jumpToDefinition = this.jumpToDefinitionOverride.bind(this);
};

handler.onReceivedSummaries = function(kind, summaries) {
    infer.registerSummary(kind, summaries);
};

handler.jumpToDefinitionOverride = function(doc, fullAst, pos, currentNode, callback) {
    // TODO: cleanup, this shouldn't be JavaScript-specific
    var _self = this;
    jsinferJumpToDef(doc, fullAst, pos, currentNode, function(results) {
        if (results.length)
            return callback(results);
        jsonalyzer.findImports(doc, fullAst, true, function(imports) {
            if (imports.length && !_self.disabled && !jsonalyzer.disabled) {
                jsonalyzer.enqueueFetchLongSummaries(imports, function() {
                    jsinferJumpToDef(doc, fullAst, pos, currentNode, function(results) {
                        if (results && results.length)
                            return callback(results);
                        jumpToDefFallback.jumpToDefinitionFallback(doc, fullAst, pos, currentNode, callback);
                    });
                });
            }
            else {
                jumpToDefFallback.jumpToDefinitionFallback(doc, fullAst, pos, currentNode, callback);
            }
        });
    });
};

handler.findImports = function(path, doc, ast, callback) {
    callback(this.findImportsSync(ast));
};

/**
 * Get a list of all modules imported from
 * require() statements in an AST.
 *
 * @param excludeAnalyzed  if true, don't include modules that were already analyzed
 */
handler.findImportsSync = function(ast) {
    if (!ast)
        return [];
    
    var basePath = path.getBasePath(jsonalyzer.path, jsonalyzer.workspaceDir);
    return ast.collectTopDown(
        'Call(Var("require"), [String(required)])', function(b) {
            var name = b.required.value;
            if (name.match(/^text!/))
                return;
            var isFilePath = path.isRelativePath(name) || path.isAbsolutePath(name);
            var result = isFilePath ? path.canonicalizePath(name, basePath) : "js_p:" + name;
            if (isFilePath && !result.match(/\.js$/))
                result += ".js";
            return result;
        }
    ).toArray();
};

});
