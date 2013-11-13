/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save"
    ];
    main.provides = [
        "jsonalyzer"
    ];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var c9 = imports.c9;
        var language = imports.language;
        var watcher = imports.watcher;
        var save = imports.save;
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var worker;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            language.registerLanguageHandler(
                "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_handler",
                function(err, langWorker) {
                    if (err)
                        return console.error(err);
                    worker = langWorker;
                    watcher.on("change", onFileChange);
                    watcher.on("directory", onDirChange);
                    save.on("afterSave", onFileSave);
                    c9.on("stateChange", onOnlineChange);
                    onOnlineChange();
                }
            );
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
        });
        
        register(null, { jsonalyzer: plugin });
    }
});