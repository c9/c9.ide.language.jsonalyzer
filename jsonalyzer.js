/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    
    // TODO: move these to default_plugins.js
    // TODO: send packed server components
    
    var HANDLERS_WORKER = [
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_js",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_md",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_php",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_sh",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_ctags",
    ];
    
    var HANDLERS_SERVER = [
        "plugins/c9.ide.language.jsonalyzer/server/handlers/jsonalyzer_sh_server",
    ];
    
    var HELPERS_SERVER = [
        "plugins/c9.ide.language/worker",
        "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker",
        "plugins/c9.ide.language.jsonalyzer/worker/architect_resolver_worker",
        "plugins/c9.ide.language/complete_util",
        "plugins/c9.ide.language/worker_util",
        "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler",
        "plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util",
        "plugins/c9.ide.language.javascript.infer/path",
    ];
    
    var HELPERS_WORKER = [];
    
    var MOCK_HELPERS_SERVER = {
        "plugins/c9.ide.language/worker":
            require("text!./server/mock_language_worker.js"),
        "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker":
            require("text!./server/mock_jsonalyzer_worker.js"),
        "plugins/c9.ide.language.jsonalyzer/worker/architect_resolver_worker":
            require("text!./server/mock_architect_resolver_worker.js"),
    };
    
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save", "language.complete", "dialog.error", "ext",
        "collab"
    ];
    main.provides = [
        "jsonalyzer"
    ];
    main.workerPlugins = HANDLERS_WORKER.concat(HELPERS_WORKER);
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
        var async = require("async");
        var collab = imports.collab;
        
        var useCollab = options.useCollab;
        var homeDir = options.homeDir.replace(/\/$/, "");
        var workspaceDir = options.workspaceDir.replace(/\/$/, "");
        
        var worker;
        var server;
        var extraHandlersServer = [];
        
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
                    c9.on("stateChange", onOnlineChange);
                    worker.on("jsonalyzerCallServer", onCallServer);
                    onOnlineChange();
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
            // TODO: use c9.on("connect")/c9.on("disconnect") / see onOnlineChange
            loadServer(function(err, result) {
                if (err) {
                    showError("Language server could not be loaded; some language features have been disabled");
                    return console.error(err.stack || err);
                }
                
                // TODO: work w/o collab for desktop
                if (!useCollab)
                    console.warning("Collab is disabled: certain language server features won't work");
                
                result.init(options, function(err) {
                    if (err) {
                        showError("Language server could not be loaded; some language features have been disabled");
                        return console.error(err);
                    }
                    server = result;
                    emit.sticky("initServer");
                });
            });

            // Load plugins
            HANDLERS_SERVER.forEach(function(plugin) {
                registerServerHandler(plugin, options);
            });
            HANDLERS_WORKER.forEach(function(plugin) {
                registerWorkerHandler(plugin);
            });
        }
        
        function loadServer(callback) {
            // function checkProgress() {
            //     clearTimeout(checkProgress.timer);
            //     checkProgress.timer = setTimeout(function() {
            //         setTimeout(function() { // wait a bit longer in case we were in the debugger
            //             if (!server)
            //                 showError("Language server could not be loaded; some language features have been disabled");
            //         }, 50);
            //     }, 45000);
            // }

            // TODO: abort on offline state
            ext.loadRemotePlugin("jsonalyzer_server", {
                code: require("text!./server/jsonalyzer_server.js"),
                redefine: true
            }, function(err, server) {
                if (err) return callback(err);
                
                async.map(
                    HELPERS_SERVER,
                    function(path, mapNext) {
                        if (MOCK_HELPERS_SERVER[path])
                            return mapNext(null, { path: path, content: MOCK_HELPERS_SERVER[path] });
                        require(["text!" + path + ".js"], function(content) {
                            return mapNext(null, { path: path, content: content });
                        });
                    },
                    function(err, helpers) {
                        if (err) return callback(err);
                        
                        async.forEachSeries(
                            helpers,
                            function(helper, forNext) {
                                server.registerHelper(helper.path, helper.content, options, forNext);
                            },
                            function(err) {
                                callback(err, server);
                            }
                        );
                    }
                );
            });
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
            plugin.on("initWorker", function(err) {
                if (err)
                    console.error(err);
                    
                worker.emit("onlinechange", {data: { isOnline: c9.connected }});
            });
        }
        
        function onCallServer(event) {
            var data = event.data;
            var collabDoc = useCollab && collab.getDocument(data.filePath);
            var revNum;
            if (collabDoc) {
                collabDoc.delaysDisabled = true;
                var revNum = collabDoc.latestRevNum + (collabDoc.pendingUpdates ? 1 : 0);
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
                    plugin.on("initWorker", function() {
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
            
            plugin.on("initServer", function() {
                server.registerHandler(path, contents, options, function(err, meta) {
                    if (err) {
                        console.error("Failed to load " + path, err);
                        return callback && callback(err);
                    }
                    
                    plugin.on("initWorker", function() {
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
            
            plugin.on("initServer", function() {
                server.registerHelper(path, contents, options, function(err) {
                    if (err)
                        console.error("Failed to load " + path, err);
                    callback && callback(err);
                });
            });
        }
        
        function registerWorkerHandler(path, contents, options, callback) {
            if (contents && typeof contents !== "string")
                return registerWorkerHandler(path, null, arguments[1], arguments[2]);
            if (typeof options === "function")
                return registerWorkerHandler(path, contents, {}, options);
            
            language.getWorker(function(err, worker) {
                plugin.on("initWorker", function() {
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