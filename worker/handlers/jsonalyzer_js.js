/**
 * jsonalyzer JavaScript analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer;
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var ctagsUtil = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util");
var asyncForEach = require("plugins/c9.ide.language/worker").asyncForEach;
var workerUtil = require("plugins/c9.ide.language/worker_util");

var handler = module.exports = Object.create(PluginBase);

var TAGS = [
    {
        regex: /function\s*([A-Za-z0-9$_]+)\s*\(/g,
        kind: "unknown2"
    },
    {
        regex: /exports\.([A-Za-z0-9$_]+)\s*=\s*function\b/g,
        kind: "unknown2"
    },
    {
        // HACK: architect documentation contribution
        regex: /(\w+)\s*:\s*\w+/g,
        kind: "unknown2",
        docOnly: true
    }
];
var GUESS_FARGS = true;
var EXTRACT_DOCS = true;

handler.init = function(jsonalyzer_worker) {
    jsonalyzer = jsonalyzer_worker;
    jsonalyzer.registerHandler(this, "js", ["javascript"], ["js"]);
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
            lines, doc, tag, EXTRACT_DOCS, GUESS_FARGS, result.properties);
    });
    callback(null, result);
};

handler.analyzeOthers = handler.analyzeCurrentAll;

handler.findImports = function(path, doc, ast, callback) {
    // TODO: get open files + guess imports
    require("./jsonalyzer_ctags").findImports(path, doc, ast, callback);
};

/*
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
*/

});
