/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save", "language.complete", "dialog.error", "ext"
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
        var complete = imports["language.complete"];
        var showAlert = imports["dialog.error"].show;
        var hideAlert = imports["dialog.error"].hide;
        var ext = imports.ext;
        var async = require("async");
        
        var PLUGINS = [
            "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_js",
            "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_md",
            "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_php",
            "plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_ctags",
        ];
        
        var SERVER_HELPER_PLUGINS = [
            "plugins/c9.ide.language/complete_util",
            "plugins/c9.ide.language/worker_util",
            "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler",
            "plugins/c9.ide.language.jsonalyzer/worker/ctags/ctags_util",
        ];
        
        var worker;
        var server;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            var loadedWorker;
            var warning;

            PLUGINS.forEach(function(plugin) {
                registerHandler(plugin, null, plugin.match(/ctags/));
            });
            
            loadServer(function(err, result) {
                if (err) return console.error("[jsonalyzer] fatal error loading server", err);
                
                server = result;
                emit.sticky("initServer");
            });
            
            language.registerLanguageHandler(
                "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_handler",
                function(err, langWorker) {
                    if (err)
                        return showAlert(err);
                    loadedWorker = true;
                    worker = langWorker;
                    watcher.on("change", onFileChange);
                    watcher.on("directory", onDirChange);
                    save.on("afterSave", onFileSave);
                    c9.on("stateChange", onOnlineChange);
                    worker.on("jsonalyzerServerRegister", onServerRegister);
                    onOnlineChange();
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
        }
        
        function loadServer(callback) {
            ext.loadRemotePlugin("jsonalyzer_server", {
                code: require("text!./jsonalyzer_server.js"),
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
                        
                        async.forEach(SERVER_HELPER_PLUGINS, function(path, next) {
                            require(["text!" + path + ".js"], function(content) {
                                server.registerHelper(path, content, next);
                            });
                        }, callback);
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
        
        function onServerRegister(event) {
            plugin.once("serverInit", function() {
                server.registerHandler(event.filename, event.content, function(err) {
                    if (err) return console.error(err);
                });
            });
        }
        
        function registerHandler(path, contents, clientOnly, serverOnly) {
            language.getWorker(function(err, worker) {
                if (err) return console.error(err);
                worker.emit("jsonalyzerRegister", { path: path });
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
            // TODO: register method like the one language has
            registerHandler : registerHandler
        });
        
        register(null, { jsonalyzer: plugin });
    }
});