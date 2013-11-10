/**
 * jsonalyzer JavaScript analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var infer = require("plugins/c9.ide.language.javascript.infer/infer");
var path = require("plugins/c9.ide.language.javascript.infer/path");
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");

var plugin = module.exports = Object.create(PluginBase);
var handler;

plugin.init = function(theHandler) {
    handler = theHandler;
    handler.registerHandler(this, "js", ["javascript"], ["js", "json"]);
};

handler.findImports = function(path, doc, ast, callback) {
    callback(this.findImportsSync(ast));
};

function findImportsSync(ast) {
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
