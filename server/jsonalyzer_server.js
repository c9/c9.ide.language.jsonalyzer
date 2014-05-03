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
var handlers = {};
var vfs;

module.exports = function(_vfs, options, register) {
    vfs = _vfs;
    
    register(null, {
        init: init,
        
        registerHelper: registerHelper,
        
        registerHandler: registerHandler,
        
        callHandler: callHandler
    });
};

function init(collab, callback) {
    if (!collab)
        return callback();

    vfs.use("collab", {}, function(err, collab) {
        if (err)
            return callback(err);
        collabServer = collab.api;
        collabServer.emitter.on("afterEditUpdate", onAfterEditUpdate);
        
        console.log("testing Store");
        
        callback();
    });
}

function getCollabDoc(path, oldRevNum, callback) {
    collabServer.Store.getDocument(
        path,
        ["contents", "revNum"],
        function (err, doc) {
            if (err) return callback(err);
            
            callback(null, {
                contents: doc.contents,
                isUpToDate: oldRevNum <= doc.revNum
            });
        }
    );
}

function onAfterEditUpdate(e) {
    console.log("EDIT UPDATE", e); // TODO
}

function registerHelper(path, content, callback) {
    loadPlugin(path, content, function(err, result) {
        callback(err);
    });
}

function registerHandler(path, content, callback) {
    loadPlugin(path, content, function(err, result) {
        if (err)
            return callback(err);
        handlers[path] = result;
        callback(null, {
            languages: result.languages,
            extensions: result.extensions,
            path: path
        });
    });
}

function callHandler(handlerPath, method, args, options, callback) {
    var handler = handlers[handlerPath];
    if (!handler)
        return callback("No such handler: " + handlerPath);
    if (!handler[method])
        return callback("No such method on " + handlerPath + ": " + method);
    
    switch (method) {
        case "analyzeCurrent":
        case "findImports":
            getCollabDoc(args[0], options.revNum, function(err, doc) {
                args[1] = doc.contents;
                done();
            });
            break;
        default:
            done();
    }
    
    function done() {
        handler[method].apply(handler, args.concat(callback));
    }
}

function loadPlugin(path, content, callback) {
    var sandbox = {};
    var exports = {};
    
    if (!path || path.match(/^\.|\.js$/))
        return callback(new Error("Illegal module name: " + path));
    if (!content)
        return callback(new Error("No content provided: " + path));

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