/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save", "language.complete", "dialog.error", "ext",
        "collab"
    ];
    main.provides = [
        "jsonalyzer"
    ];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();
        var c9 = imports.c9;
        var language = imports.language;
        var watcher = imports.watcher;
        var save = imports.save;
        var showError = imports["dialog.error"].show;
        var hideError = imports["dialog.error"].hide;
        var ext = imports.ext;
        var plugins = require("./default_plugins");
        var async = require("async");
        var collab = imports.collab;
        
        var useCollab = options.useCollab;
        var homeDir = options.homeDir.replace(/\/$/, "");
        var workspaceDir = options.workspaceDir.replace(/\/$/, "");
        var serverOptions = {};
        for (var o in options) {
            if (typeof options[o] !== "function" && options.hasOwnProperty(o))
                serverOptions[o] = options[o];
        };
        
        var worker;
        var server;
        var serverLoading = false;
        var serverPluginCount = 0;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            var loadedWorker;
            var warning;
            
            emit.setMaxListeners(50);
            
            // Load worker
            language.registerLanguageHandler(
                "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker",
                function(err, langWorker) {
                    if (err)
                        return showError(err);
                    loadedWorker = true;
                    worker = langWorker;
                    watcher.on("change", onFileChange);
                    watcher.on("directory", onDirChange);
                    save.on("afterSave", onFileSave);
                    c9.on("connect", onOnlineChange);
                    c9.on("disconnect", onOnlineChange);
                    worker.on("jsonalyzerCallServer", onCallServer);
                    worker.emit("onlinechange", {data: { isOnline: c9.connected }});
                    emit.sticky("initWorker");
                    if (warning)
                        hideError(warning);
                }
            );
            setTimeout(function() {
                setTimeout(function() { // wait a bit longer in case we were in the debugger
                    if (!loadedWorker)
                        warning = showError("Language worker could not be loaded; some language features have been disabled");
                }, 50);
            }, 30000);
            
            // Load server
            loadServer(function(err) {
                if (err) {
                    showError("Language server could not be loaded; some language features have been disabled");
                    return console.error(err.stack || err);
                }
            });
                                        
            plugins.handlersWorker.forEach(function(plugin) {
                registerWorkerHandler(plugin);
            });
        }
        
        function loadServer(callback) {
            if (serverLoading)
                plugin.once("initServer", callback);
                
            tryConnect();
            
            function tryConnect() {
                var handlers;
                async.series([
                    function checkLoaded(next) {
                        if (!server)
                            return next();
                        
                        server.getPluginCount(function(err, count) {
                            if (!err && count === serverPluginCount)
                                return done();
                            next(err);
                        });
                    },
                    function loadExtension(next) {
                        if (server) return next();
                        
                        ext.loadRemotePlugin(
                            "jsonalyzer_server",
                            {
                                code: require("text!./server/jsonalyzer_server.js"),
                                redefine: true
                            },
                            function(err, _server) {
                                server = _server;
                                next(err);
                            }
                        );
                    },
                    function callInit(next) {
                        if (!useCollab)
                            return next(new Error("Collab is disabled"));
                        
                        server.init(serverOptions, next);
                    },
                    function loadHelpers(next) {
                        server.registerHelpers(plugins.helpersServer, serverOptions, next);
                    },
                    function loadHandlers(next) {
                        server.registerHandlers(plugins.handlersServer, serverOptions, function(err, result) {
                            handlers = result.metas;
                            next(err);
                        });
                    },
                    function notifyWorker(next) {
                        plugin.once("initWorker", function() {
                            handlers.forEach(function(meta) {
                                worker.emit("jsonalyzerRegisterServer", { data: meta });
                            });
                            next();
                        });
                    },
                ], done);
            }
            
            function done(err) {
                if (err && err.code === "EDISCONNECT" || !err && !c9.connected)
                    return tryConnect();
                if (err)
                    return callback(err);
                
                serverLoading = false;
                
                emit.sticky("initServer");
                callback();
            }
        }
        
        function onFileChange(event) {
            if (worker)
                worker.emit("filechange", {data: {path: event.path}});
        }
        
        function onFileSave(event) {
            if (!event.silentsave)
                worker.emit("filechange", {data: {path: event.path, value: event.document && event.document.value, isSave: true}});
        }
        
        function onDirChange(event) {
            if (worker)
                worker.emit("dirchange", {data: event});
        }
        
        function onOnlineChange(event) {
            plugin.once("initWorker", function(err) {
                if (err)
                    console.error(err);
                    
                worker.emit("onlinechange", {data: { isOnline: c9.connected }});
            });
            
            if (!c9.connected) {
                emit.unsticky("initServer");
                return;
            }
            
            // Reconnect to server
            server.getPluginCount(function(err, count) {
                if (c9.connected && err) {
                    return loadServer(function(err) {
                        if (err) {
                            showError("Language server could not be loaded; some language features have been disabled");
                            console.error(err);
                        }
                    });
                }
                
                plugins.helpersServer.length + plugins.handlersServer.length;
            });
        }
        
        function onCallServer(event) {
            var data = event.data;
            var collabDoc = useCollab && collab.getDocument(data.filePath);
            var revNum;
            if (collabDoc) {
                collabDoc.delaysDisabled = true;
                revNum = collabDoc.latestRevNum + (collabDoc.pendingUpdates ? 1 : 0);
            }
            server.callHandler(
                data.handlerPath,
                data.method,
                data.args,
                {
                    filePath: toOSPath(data.filePath),
                    revNum: revNum
                },
                function(err, response) {
                    var resultArgs = response && response.result || [err];
                    resultArgs[0] = resultArgs[0] || err;
                    plugin.once("initWorker", function() {
                        worker.emit(
                            "jsonalyzerCallServerResult",
                            { data: {
                                handlerPath: data.handlerPath,
                                result: resultArgs,
                                id: data.id
                            } }
                        );
                    });
                }
            );
        }
        
        function toOSPath(path) {
            return path
                .replace(/^\//, workspaceDir + "/")
                .replace(/^~\//, homeDir + "/");
        }
               
        function registerServerHandler(path, contents, options, callback) {
            if (typeof contents !== "string")
                return require(["text!" + path + ".js"], function(value) {
                    registerServerHandler(path, value, contents, options);
                });
            if (typeof options === "function")
                return registerServerHandler(path, contents, {}, options);
            
            plugin.once("initServer", function() {
                server.registerHandler(path, contents, options, function(err, meta) {
                    if (err) {
                        console.error("Failed to load " + path, err);
                        return callback && callback(err);
                    }
                    
                    // Persist in case of server restart
                    plugins.handlersServer.push({
                        path: path,
                        contents: contents,
                        options: options || {}
                    });
                    
                    plugin.once("initWorker", function() {
                        worker.emit("jsonalyzerRegisterServer", { data: meta });
                        callback && callback();
                    });
                });
            });
        }
               
        function registerServerHelper(path, contents, options, callback) {
            if (typeof contents !== "string")
                return require(["text!" + path + ".js"], function(value) {
                    registerServerHelper(path, value, contents, options);
                });
            if (typeof options === "function")
                return registerServerHelper(path, contents, {}, options);
            
            plugin.once("initServer", function() {
                server.registerHelper(path, contents, options, function(err) {
                    if (err) {
                        console.error("Failed to load " + path, err);
                        callback && callback(err);
                    }
                    
                    // Persist in case of server restart
                    plugins.handlersServer.push({
                        path: path,
                        contents: contents,
                        options: options || {}
                    });
                    
                    callback && callback();
                });
            });
        }
        
        function registerWorkerHandler(path, contents, options, callback) {
            if (contents && typeof contents !== "string")
                return registerWorkerHandler(path, null, arguments[1], arguments[2]);
            if (typeof options === "function")
                return registerWorkerHandler(path, contents, {}, options);
            
            language.getWorker(function(err, worker) {
                plugin.once("initWorker", function() {
                    if (err) return console.error(err);
                    
                    worker.emit("jsonalyzerRegister", { data: {
                        modulePath: path,
                        contents: contents,
                        options: options
                    }});
                    
                    worker.on("jsonalyzerRegistered", function listen(e) {
                        if (e.data.modulePath !== path)
                            return;
                        worker.off(listen);
                        callback && callback(e.err);
                    });
                });
            });
        }
        
        plugin.on("load", function(){
            load();
        });
        
        /**
         * The jsonalyzer analysis infrastructure.
         * 
         * @singleton
         * @ignore Experimental.
         */
        plugin.freezePublicAPI({
            /**
             * Register a new web worker-based handler.
             * 
             * @param {String} path
             * @param {String} [contents]
             * @param {Object} [options]
             * @param {Function} [callback]
             */
            registerWorkerHandler : registerWorkerHandler,
            
            /**
             * Register a new server-based handler.
             *
             * @param {String} path
             * @param {String} [contents]
             * @param {Object} [options]
             * @param {Function} [callback]
             */
            registerServerHandler : registerServerHandler,
            
            /**
             * Register a new server-based handler helper.
             *
             * @param {String} path
             * @param {String} [contents]
             * @param {Object} [options]
             * @param {Function} [callback]
             */
            registerServerHelper : registerServerHelper
        });
        
        register(null, { jsonalyzer: plugin });
    }
});