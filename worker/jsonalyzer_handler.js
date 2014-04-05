/*
 * jsonalyzer worker
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var baseLanguageHandler = require("plugins/c9.ide.language/base_handler");
var index = require("./semantic_index");
var assert = require("c9/assert");
var jumptodef = require("./jumptodef");
var complete = require("./complete");
var outline = require("./outline");
var refactor = require("./refactor");
var highlight = require("./highlight_occurrences");
var scopeAnalyzer = require('plugins/c9.ide.language.javascript/scope_analyzer');
var directoryIndexer = require("./directory_indexer");
var fileIndexer = require("./file_indexer");
var ctagsUtil = require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util");
var ctagsEx =  require("plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_ex");
require("treehugger/traverse"); // add traversal methods

var handler = module.exports = Object.create(baseLanguageHandler);
var isOnline = false;
var supportedLanguages = "";
var supportedExtensions = "";
var plugins = [];
var isInWebWorker = typeof window == "undefined" || !window.location || !window.document;

handler.$isInited = false;
handler.DEBUG = true;
handler.KIND_DEFAULT = scopeAnalyzer.KIND_DEFAULT;
handler.KIND_PACKAGE = scopeAnalyzer.KIND_PACKAGE;
handler.GUID_PREFIX = "project:";

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
    handler.sender.on("jsonalyzerRegister", function(event) {
        _self.loadPlugin(event.data.modulePath, event.data.contents, function(err, plugin) {
            handler.sender.emit("jsonalyzedRegistered", { modulePath: event.data.modulePath, err: err });
            if (err) return console.error(err);
            plugin.$source = event.data.modulePath;
            _self.registerPlugin(plugin);
        });
    });
    
    directoryIndexer.init(this);
    fileIndexer.init(this);
    index.init(this);
    jumptodef.init(this);
    complete.init(this);
    outline.init(this);
    refactor.init(this);
    highlight.init(this);
    ctagsUtil.init(ctagsEx, this);
    
    // Calling the callback to register/activate the plugin
    // (calling it late wouldn't delay anything else)
    callback();
};

handler.loadPlugin = function(modulePath, contents, callback) {
    // This follows the same approach as c9.ide.language/worker.register();
    // see the comments there for more background.
    if (contents) {
        try {
            eval.call(null, contents);
        } catch (e) {
            return callback("Could not load language handler " + modulePath + ": " + e);
        }
    }
    var handler;
    try {
        handler = require(modulePath);
        if (!handler)
            throw new Error("Unable to load required module: " + modulePath);
    } catch (e) {
        if (isInWebWorker)
            return callback("Could not load language handler " + modulePath + ": " + e);
        
        // In ?noworker=1 debugging mode, synchronous require doesn't work
        return require([modulePath], function(handler) {
            if (!handler)
                return callback("Could not load language handler " + modulePath);
            callback(null, handler);
        });
    }
    callback(null, handler);
};

handler.registerPlugin = function(plugin) {
    var languages = plugin.languages;
    var extensions = plugin.extensions;
    assert(languages && extensions, "Plugins must have a languages and extensions property");
    
    if (plugins.indexOf(plugin) === -1)
        plugins.push(plugin);
    languages.forEach(function(e) {
        supportedLanguages += (supportedLanguages ? "|^" : "^") + e;
        plugin.supportedLanguages += (plugin.supportedLanguages ? "|^" : "^") + e + "$";
    });
    extensions.forEach(function(e) {
        supportedExtensions += (supportedExtensions ? "|^" : "^") + e + "$";
        plugin.supportedExtensions += (plugin.supportedExtensions ? "|^" : "^") + e + "$";
    });
};

handler.handlesLanguage = function(language) {
    return this.getPluginFor(this.path, language);
};

handler.onDocumentOpen = function(path, doc, oldPath, callback) {
    // Check path validity if inited; otherwise do check later
    if (this.$isInited && !this.getPluginFor(path, null))
        return;
    
    // Analyze any opened document to make completions more rapid
    fileIndexer.analyzeOthers([path]);
};

handler.analyze = function(doc, ast, callback, minimalAnalysis) {
    if (minimalAnalysis && index.get(handler.path))
        return callback();
    
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
    
    if (!this.getPluginFor(path, null))
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

handler.getPluginFor = function(path, language) {
    language = language || handler.path === path && handler.language;
    
    var match = path && path.match(/\.([^/.]*)$/);
    var extension = match && match[1] || "";
    if (!extension.match(supportedExtensions) && !(language || "").match(supportedLanguages))
        return null;
    
    var results = plugins.filter(function(p) {
        return language && language.match(p.supportedLanguages);
    }).concat(
    plugins.filter(function(p) {
        return extension.match(p.supportedExtensions)
            && (!p.supportedPaths || (path && path.match(p.supportedPaths)));
    }));
    
    // Defer ctags plugin
    if (results.length > 1)
        results = results.filter(function(r) { return !r.isGeneric; });
    
    return results[0];
};

handler.getAllPlugins = function() {
    return plugins;
};

});

