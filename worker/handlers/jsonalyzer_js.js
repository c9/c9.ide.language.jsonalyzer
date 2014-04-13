/**
 * jsonalyzer basic JavaScript analysis
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var jsonalyzer;
var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var ctagsUtil = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util");
var pathUtil = require("plugins/c9.ide.language.javascript.infer/path");
var architectResolver = require("../architect_resolver_worker");

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
        regex: /\s(\w+)\s*:\s*\w+(?:\s|,)/g,
        kind: "unknown2",
        docOnly: true
    }
];
var GUESS_FARGS = true;
var EXTRACT_DOCS = true;

var handler = module.exports = Object.create(PluginBase);

handler.extensions = ["js"];

handler.languages = ["javascript"];

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    if (doc === "")
        return callback(null, {});
        
    if (doc.length > jsonalyzer.getMaxFileSizeSupported())
        return callback(null, {});
    
    var results = {};
    TAGS.forEach(function(tag) {
        if (tag.kind === "import")
            return;
        ctagsUtil.findMatchingTags(path, doc, tag, EXTRACT_DOCS, GUESS_FARGS, results);
    });
    callback(null, { properties: results });
};

handler.analyzeOthers = handler.analyzeCurrentAll;

handler.findImports = function(path, doc, ast, callback) {
    var archImports = architectResolver.findImports(path, doc, ast);
    var openFiles = ctagsUtil.findMatchingOpenFiles(path);
    var astImports = findImportsInAST(path, ast);
        
    callback(null, archImports.concat(openFiles, astImports));
};

function findImportsInAST(path, ast) {
    if (!ast)
        return [];
    
    var basePath = path.match(/^(.*?)(\/[^\/]+)?$/)[1];
    return ast.collectTopDown(
        'Call(Var("require"), [String(required)])', function(b) {
            var name = b.required.value;
            if (name.match(/^text!/))
                return;
            var isFilePath = pathUtil.isAbsolutePath(name) || pathUtil.isRelativePath(name);
            
            // HACK: we only support file paths right now
            if (!isFilePath)
                name = guessFilePath(basePath, name);
            if (!name)
                return;
            
            var result = isFilePath ? pathUtil.canonicalizePath(name, basePath) : "js_p:" + name;
            if (isFilePath && !result.match(/\.js$/))
                result += ".js";
            return result;
        }
    ).toArray();
};

function guessFilePath(basePath, importPath) {
    var baseDir = importPath.match(/[^\/]+/)[0];
    if (!baseDir)
        return;
    var i = basePath.indexOf(baseDir);
    if (i === -1)
        return;
    return basePath.substr(0, i) + importPath;
}

});
