define(function(require, exports, module) {
    
    var lastId = 0;
    
    /**
     * Wraps a server handler into a worker handler.
     */
    module.exports.ServerHandlerWrapper = function(descriptor, worker) {
        var PluginBase = require("./jsonalyzer_base_handler");
        var result = Object.create(PluginBase);
        result.$source = descriptor.path;
        result.languages = descriptor.properties.languages;
        result.extensions = descriptor.properties.extensions;
        
        if (descriptor.functions.analyzeCurrent)
            result.analyzeCurrent = function(path, value, ast, options, callback) {
                callServer({
                    handlerPath: descriptor.path,
                    filePath: path,
                    method: "analyzeCurrent",
                    args: [path, null, null, options]
                }, callback);
            };
        if (descriptor.functions.findImports)
            result.findImports = function(path, value, ast, options, callback) {
                callServer({
                    handlerPath: descriptor.path,
                    filePath: path,
                    method: "findImports",
                    args: [path, null, null, options]
                }, callback);
            };
        if (descriptor.functions.analyzeOthers)
            result.analyzeOthers = function(paths, options, callback) {
                callServer({
                    handlerPath: descriptor.path,
                    filePath: null, // we're not using collab for these so we don't care
                    method: "analyzeOthers",
                    args: [paths, options]
                }, callback);
            };
        return result;
    
        function callServer(options, callback) {
            options.id = ++lastId;
            worker.sender.on("jsonalyzerCallServerResult", function onResult(e) {
                if (e.data.id !== options.id)
                    return;
                worker.sender.off(onResult);
                
                var err = e.data.result[0];
                if (err && err.code === "EFATAL") {
                    console.error("Fatal error in " + descriptor.path, err);
                    delete result[options.method];
                }
                
                callback.apply(null, e.data.result);
            });
            worker.sender.emit("jsonalyzerCallServer", options);
        }
    };
    
});