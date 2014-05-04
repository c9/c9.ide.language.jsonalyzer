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

function init(options, callback) {
    if (!options.useCollab)
        return callback();

    vfs.use("collab", {}, function(err, collab) {
        if (err)
            return callback(err);
        collabServer = collab.api;
        collabServer.emitter.on("afterEditUpdate", onAfterEditUpdate);
        
        callback();
    });
}

function getCollabDoc(path, revNum, callback) {
    collabServer.Store.getDocument(
        path.replace(/^\//, ""),
        ["contents", "revNum"],
        callback
    );
}

function onAfterEditUpdate(e) {
    console.log("EDIT UPDATE", e); // TODO
}

function registerHelper(path, content, options, callback) {
    loadPlugin(path, content, function(err, result) {
        if (!result.init)
            return callback(err);
        result.init(options, callback);
    });
}

function registerHandler(handlerPath, content, options, callback) {
    loadPlugin(handlerPath, content, function(err, result) {
        if (err)
            return callback(err);
        handlers[handlerPath] = result;

        if (!result.init)
            return done();
        result.init(options, done);
        
        function done(err) {
            callback(err, {
                languages: result.languages,
                extensions: result.extensions,
                handlerPath: handlerPath,
                methods: arrayToObject(Object.keys(result))
            });
        }
    });
}

function arrayToObject(array) {
    var obj = {};
    for (var i = 0; i < array.length; i++) {
        obj[array[i]] = true;
    }
    return obj;
}

function callHandler(handlerPath, method, args, options, callback) {
    console.log("calling 0", handler, method)

    var handler = handlers[handlerPath];
    if (!handler)
        return callback(new Error("No such handler: " + handlerPath));
    if (!handler[method])
        return callback(new Error("No such method on " + handlerPath + ": " + method));
    
    console.log("calling 1", handler, method)
    
    var revNum;
    
    switch (method) {
        case "analyzeCurrent":
        case "findImports":
            var clientPath = args[0];
            var osPath = options.filePath;
            getCollabDoc(clientPath, options.revNum, function(err, doc) {
                if (err) return done(err);
                if (!doc) {
                    // Document doesn't appear to exist in collab;
                    // we'll pass null instead and wait for the
                    // plugin to decide what to do.
                    console.log("no doc for", clientPath.replace(/^\//, ""))
                    revNum = -1;
                    return callMethod();
                }
                
                args[0] = osPath;
                args[1] = doc.contents;
                args[3] = args[3] || {}; // options
                args[3].clientPath = clientPath;
                revNum = doc.revNum;
                callMethod();
            });
            break;
        default:
            callMethod();
    }
    
    function callMethod() {
        console.log("calling 2", handler, method)
        try {
            handler[method].apply(handler, args.concat(done));
        } catch (e) {
            done(e);
        }
    }
    
    function done(err) {
        if (err) return callback(err);
        
        return callback(null, {
            revNum: revNum,
            result: [].slice.apply(arguments)
        });
    }
}

function loadPlugin(path, content, callback) {
    console.log("[jsonalyzer] loading plugin", path)
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
    sandbox.console = console;
    sandbox.process = process;
    sandbox.define = function(def) {
        def(sandbox.require, sandbox.exports, sandbox.module);
    };
    
    var script = vm.createScript(content.replace(/^\#\!.*/, ''), path);
    try {
        var pathJS = path.replace(/(\.js|)$/, ".js");
        script.runInNewContext(sandbox, pathJS);
    } catch (e) {
        console.error("Error loading " + path + ":", e.stack);
        e.message = ("Error loading " + path + ": " + e.message);
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