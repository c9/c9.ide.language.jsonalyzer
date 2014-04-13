/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    var PLUGINS = [
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_js",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_md",
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_php",
    ];
    
    var PLUGINS_WORKER = PLUGINS.concat([
        "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_ctags",
    ]);
    
    var PLUGINS_SERVER = PLUGINS;
    
    var HELPERS_SERVER = [
        "plugins/c9.ide.language/complete_util",
        "plugins/c9.ide.language/worker_util",
        "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler",
        "plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util",
    ];
    
    var HELPERS_WORKER = [];
    
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save", "language.complete", "dialog.error", "ext"
    ];
    main.provides = [
        "jsonalyzer"
    ];
    main.workerPlugins = PLUGINS_WORKER.concat(HELPERS_WORKER);
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();
        var c9 = imports.c9;
        var language = imports.language;
        var watcher = imports.watcher;
        var save = imports.save;
        var showAlert = imports["dialog.error"].show;
        var hideAlert = imports["dialog.error"].hide;
        var ext = imports.ext;
        var async = require("async");
        
        var worker;
        var server;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            var loadedWorker;
            var warning;
            
            // Load worker
            language.registerLanguageHandler(
                "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_worker",
                function(err, langWorker) {
                    if (err)
                        return showAlert(err);
                    loadedWorker = true;
                    worker = langWorker;
                    watcher.on("change", onFileChange);
                    watcher.on("directory", onDirChange);
                    save.on("afterSave", onFileSave);
                    c9.on("stateChange", onOnlineChange);
                    onOnlineChange();
                    emit.sticky("initWorker");
                    if (warning)
                        hideAlert(warning);
                }
            );
            setTimeout(function() {
                setTimeout(function() { // wait a bit longer in case we were debugging
                    if (!loadedWorker)
                        warning = showAlert("Language worker could not be loaded; some language features have been disabled");
                }, 50);
            }, 30000);
            
            // Load server
            loadServer(function(err, result) {
                if (err) {
                    showAlert("Language server could not be loaded; some language features have been disabled");
                    return console.error(err);
                }
                
                server = result;
                emit.sticky("initServer");
            });

            // Load plugins
            PLUGINS_SERVER.forEach(function(plugin) {
                registerServerHandler(plugin, null);
            });
            PLUGINS_WORKER.forEach(function(plugin) {
                registerWorkerHandler(plugin, null);
            });
        }
        
        function loadServer(callback) {
            ext.loadRemotePlugin("jsonalyzer_server", {
                code: require("text!./server/jsonalyzer_server.js"),
                redefine: true
            }, function(err, server) {
                if (err) return callback(err);
                
                server.registerHelper(
                    "plugins/c9.ide.language/worker",
                    "['$lastWorker', 'sender'].forEach(function(p) { \
                        Object.defineProperty(module.exports, p, { \
                            get: function() { throw new Error('Unavailable in server context: worker.' + p); } \
                        }); \
                     }); \
                     module.exports.asyncForEach = require('async').forEach;",
                    function(err) {
                        if (err) return callback(err);
                        
                        async.forEach(HELPERS_SERVER, function(path, next) {
                            require(["text!" + path + ".js"], function(content) {
                                server.registerHelper(path, content, next);
                            });
                        }, function() {
                            callback(null, server);
                        });
                    }
                );
            });
        }
        
        function onFileChange(event) {
            worker.emit("filechange", {data: {path: event.path}});
        }
        
        function onFileSave(event) {
            if (!event.silentsave)
                worker.emit("filechange", {data: {path: event.path, value: event.document && event.document.value, isSave: true}});
        }
        
        function onDirChange(event) {
            worker.emit("dirchange", {data: event});
        }
        
        function onOnlineChange(event) {
            worker.emit("onlinechange", {data: { isOnline: c9.connected }});
        }
               
        function registerServerHandler(path, contents, callback) {
            plugin.on("initServer", function() {
                server.registerHandler(path, contents, callback);
            });
        }
               
        function registerServerHelper(path, contents, callback) {
            plugin.on("initServer", function() {
                server.registerHandler(path, contents, callback);
            });
        }
        
        function registerWorkerHandler(modulePath, contents, callback) {
            language.getWorker(function(err, worker) {
                plugin.on("initWorker", function() {
                    if (err) return console.error(err);
                    
                    worker.emit("jsonalyzerRegister", { data: {
                        modulePath: modulePath,
                        contents: contents
                    }});
                    
                    worker.on("jsonalyzerRegistered", function listen(e) {
                        if (e.data.modulePath !== modulePath)
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
            registerWorkerHandler : registerWorkerHandler,
            
            registerServerHandler : registerServerHandler,
            
            registerServerHelper : registerServerHelper
        });
        
        register(null, { jsonalyzer: plugin });
    }
});