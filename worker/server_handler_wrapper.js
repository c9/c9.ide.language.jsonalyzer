define(function(require, exports, module) {
    
    var lastId = 0;
    
    /**
     * Wraps a server handler into a worker handler.
     */
    module.exports.ServerHandlerWrapper = function(descriptor, worker) {
        var PluginBase = require("./jsonalyzer_base_handler");
        var result = Object.create(PluginBase);
        result.$source = descriptor.handlerPath;
        result.languages = descriptor.languages;
        result.extensions = descriptor.extensions;
        
        if (descriptor.methods.analyzeCurrent)
            result.analyzeCurrent = function(path, value, ast, options, callback) {
                callServer({
                    handlerPath: descriptor.handlerPath,
                    filePath: path,
                    method: "analyzeCurrent",
                    args: [path, null, null, options]
                }, callback);
            };
        if (descriptor.methods.findImports)
            result.findImports = function(path, value, ast, options, callback) {
                callServer({
                    handlerPath: descriptor.handlerPath,
                    filePath: path,
                    method: "findImports",
                    args: [path, null, null, options]
                }, callback);
            };
        if (descriptor.methods.analyzeOthers)
            result.analyzeOthers = function(paths, options, callback) {
                callServer({
                    handlerPath: descriptor.handlerPath,
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
                callback.apply(null, e.data.result);
            });
            worker.sender.emit("jsonalyzerCallServer", options);
        }
    };
    
});