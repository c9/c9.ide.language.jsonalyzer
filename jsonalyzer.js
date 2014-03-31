/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "commands", "language", "c9", "watcher",
        "save", "language.complete", "dialog.error"
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
        var complete = imports["language.complete"];
        var showAlert = imports["dialog.error"].show;
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var worker;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            var loadedWorker;
            language.registerLanguageHandler(
                "plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_handler",
                function(err, langWorker) {
                    if (err)
                        return showError(err);
                    loadedWorker = true;
                    worker = langWorker;
                    watcher.on("change", onFileChange);
                    watcher.on("directory", onDirChange);
                    save.on("afterSave", onFileSave);
                    c9.on("stateChange", onOnlineChange);
                    complete.on("replaceText", onReplaceText);
                    onOnlineChange();
                }
            );
            setTimeout(function() {
                if (!loadedWorker)
                    showError("Language worker could not be loaded; some language features have been disabled");
            }, 30000);
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
        
        function onReplaceText(event) {
            worker.emit("replaceText", { data: event });
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