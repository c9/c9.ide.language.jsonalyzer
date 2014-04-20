/**
 * jsonalyzer server-side analysis component
 */
var vm = require("vm");
var Module = require("module");
var dirname = require("path").dirname;
var assert = require("assert");
var collabServer;

var plugins = {
    "c9/assert": assert
};
var handlers = [];

module.exports = function(vfs, options, register) {
    register(null, {
        init: init,
        
        registerHelper: registerHelper,
        
        registerHandler: registerHandler
    });
};

function init(useCollab, callback) {
    if (!useCollab)
        return callback();
    
    require(["collab-server"], function(plugin) {
        collabServer = plugin;
        // TODO: use collabServer
        return callback();
    });
}

function registerHelper(path, content, callback) {
    loadPlugin(path, content, function(err, result) {
        callback(err);
    });
}

function registerHandler(path, content, callback) {
    loadPlugin(path, content, function(err, result) {
        if (!err)
            handlers.push(result);
        callback(err);
    });
}

function loadPlugin(path, content, callback) {
    var sandbox = {};
    var exports = {};
    
    if (path.match(/^\.|\.js$/))
        return callback(new Error("Illegal module name: " + path));

    sandbox.exports = exports;
    sandbox.module = {
        exports: exports
    };
    sandbox.global = sandbox;
    sandbox.require = createRequire(path, plugins);
    sandbox.define = function(def) {
        def(sandbox.require, sandbox.exports, sandbox.module);
    };
    
    var script = vm.createScript(content.replace(/^\#\!.*/, ''), path);
    try {
        script.runInNewContext(sandbox, path);
    } catch (e) {
        console.error("Error loading " + path + ":", e.stack);
        return callback(e);
    }

    plugins[path] = sandbox.module.exports;
    callback(null, sandbox.module.exports);
}

function createRequire(path, localDefs) {
    var parentModule = new Module(path);
    parentModule.path = path;
    parentModule.paths = Module._nodeModulePaths(dirname(path));

    function createRequire(file) {
        var normalized = normalizeModule(path, file);
        if (normalized in localDefs)
            return localDefs[normalized];
        // TODO: fix relative path requires
        var exports = Module._load(file, parentModule);
        return exports;
    }

    createRequire.resolve = function(request) {
        var resolved = Module._resolveFilename(request, parentModule);
        return (resolved instanceof Array) ? resolved[1] : resolved;
    };

    createRequire.main = process.mainModule;
    createRequire.extensions = require.extensions;
    createRequire.cache = require.cache;

    return createRequire;
}

function normalizeModule(parentId, moduleName) {
    // normalize plugin requires
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return normalizeModule(parentId, chunks[0]) + "!" + normalizeModule(parentId, chunks[1]);
    }
    // normalize relative requires
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        moduleName = (base || parentId) + "/" + moduleName;

        while(moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            moduleName = moduleName.replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }

    return moduleName;
}