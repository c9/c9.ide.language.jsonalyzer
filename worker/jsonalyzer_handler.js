/*
 * jsonalyzer worker
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var baseLanguageHandler = require("plugins/c9.ide.language/base_handler");
var index = require("./semantic_index");
var plugins = require("plugins/c9.ide.language.jsonalyzer/worker/handlers/index");
var assert = require("plugins/c9.util/assert");
var jumptodef = require("./jumptodef");
var complete = require("./complete");
var outline = require("./outline");
var refactor = require("./refactor");
var highlight = require("./highlight_occurrences");
var scopeAnalyzer = require('plugins/c9.ide.language.javascript/scope_analyzer');
var directoryIndexer = require("./directory_indexer");
var fileIndexer = require("./file_indexer");
require("treehugger/traverse"); // add traversal methods

var handler = module.exports = Object.create(baseLanguageHandler);
var isOnline = false;
var supportedLanguages = "";
var supportedExtensions = "";

handler.$isInited = false;
handler.DEBUG = true;
handler.KIND_DEFAULT = scopeAnalyzer.KIND_DEFAULT;
handler.KIND_PACKAGE = scopeAnalyzer.KIND_PACKAGE;
handler.GUID_PREFIX = "project:";

handler.registerHandler = function(plugin, guidName, languages, extensions) {
    if (plugins.indexOf(plugin) === -1)
        plugins.push(plugin);
    plugin.guidName = guidName;
    plugin.guidNameRegex = new RegExp("^" + guidName + ":");
    plugin.supportedLanguages = [];
    languages.forEach(function(e) {
        supportedLanguages += (supportedLanguages ? "|" : "") + e;
        plugin.supportedLanguages += (plugin.supportedExtensions ? "|" : "") + e;
    });
    extensions.forEach(function(e) {
        supportedExtensions += (supportedExtensions ? "|" : "") + e;
        plugin.supportedExtensions += (plugin.supportedExtensions ? "|" : "") + e;
    });
};

function addToRegex(string, regex) {
    if (!string)
        string = regex;
    else
        string += "|" + regex;
}

handler.init = function(callback) {
    var _self = this;
    
    handler.sender.on("onlinechange", function(event) {
        _self.onOnlineChange(event);
    });
    handler.sender.on("filechange", function(event) {
        _self.onFileChange(event);
    });
    handler.sender.on("dirchange", function(event) {
        _self.onDirChange(event);
    });
    
    directoryIndexer.init(this);
    fileIndexer.init(this);
    index.init(this);
    jumptodef.init(this);
    complete.init(this);
    outline.init(this);
    refactor.init(this);
    highlight.init(this);
    
    plugins.forEach(function(p) {
        p.init(_self);
    });
    
    // Calling the callback to register/activate the plugin
    // (calling it late wouldn't delay anything else)
    callback();
};

handler.handlesLanguage = function(language) {
    // Let's cheat a little bit and use the path as well,
    // since ctags does any language right now
    return language
        && !!language.match(supportedLanguages)
        && this.path.match(/[^.]*$/)[0].match(supportedExtensions);
};

handler.onDocumentOpen = function(path, doc, oldPath, callback) {
    if (!path.match(supportedExtensions))
        return;
    
    // Analyze any opened document to make completions more rapid
    fileIndexer.analyzeOthers([path]);
};

handler.analyze = function(doc, ast, callback) {
    // Only eagerly analyze if the current file was actually edited
    // if (!handler.isEagerAnalysis)
    //     return callback();
    
    // Ignore embedded languages and just use the full document,
    // since we can't handle multiple segments in the index atm
    var fullDoc = this.doc.getValue();
        
    assert(handler.path);
    fileIndexer.analyzeCurrent(handler.path, fullDoc, ast, {}, function(err) {
        if (err)
            console.error("[jsonalyzer] Warning: could not analyze " + handler.path + ": " + err);
            
        // Analyze imports without blocking other analyses
        var imports = index.getImports(handler.path, true);
        if (imports && imports.length)
            fileIndexer.analyzeOthers(imports, true);
        
        callback();
    });
};

handler.complete = complete.complete.bind(complete);

handler.outline = outline.outline.bind(outline);

handler.jumpToDefinition = jumptodef.jumpToDefinition.bind(jumptodef);

handler.getRefactorings = refactor.getRefactorings.bind(refactor);

handler.getRenamePositions = refactor.getRenamePositions.bind(refactor);

handler.commitRename = refactor.commitRename.bind(refactor);

handler.highlightOccurrences = highlight.highlightOccurrences.bind(highlight);

handler.onOnlineChange = function(event) {
    isOnline = event.data.isOnline;
},

handler.onFileChange = function(event) {
    if (handler.disabled)
        return;
    var path = event.data.path.replace(/^\/((?!workspace)[^\/]+\/[^\/]+\/)?workspace\//, "");
    
    if (!path.match(supportedExtensions))
        return;
    
    if (event.data.isSave && path === this.path)
        return fileIndexer.analyzeCurrent(path, event.data.value, null, { isSave: true }, function() {});

    index.removeByPath(path);
    
    // We'll enqueue any files received here, since we can
    // assume they're still open if they're being watched
    fileIndexer.analyzeOthers([path]);
};

handler.onDirChange = function(event) {
    directoryIndexer.enqueue(event.data.path);
};

handler.getPluginFor = function(path) {
    var extension = path.match(/[^.]*$/)[0];
    if (!extension.match(supportedExtensions))
        throw new Error("No jsonalyzer plugin for " + extension);
    
    var results = plugins.filter(function(p) {
        return extension.match(p.supportedExtensions);
    });
    // Defer ctags plugin
    if (results.length > 1)
        results = results.filter(function(r) { return r.guidName !== "ctags"; });
    
    switch (results.length) {
        case 1: return results[0];
        case 0: throw new Error("No jsonalyzer plugin for " + extension);
        default: throw new Error("More than one jsonalyzer plugin registered for " + extension);
    }
};

handler.getAllPlugins = function() {
    return plugins;
};

handler.registerSummaries = function(kind, summaries, filenamesFilter) {
    plugins.forEach(function(plugin) {
        if (!plugin.guidNameRegex)
            return;
        if (filenamesFilter && !plugin.isOneExtensionSupported(filenamesFilter))
            return;
        var pluginSummaries = {};
        for (var summary in summaries) {
            if (summary.match(plugin.guidNameRegex))
                pluginSummaries[summary] = summaries[summary];
        }
        plugin.onReceivedSummaries(kind, pluginSummaries);
    });
};

});

