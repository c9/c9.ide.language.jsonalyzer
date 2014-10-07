/**
 * jsonalyzer php analysis
 *
 * @copyright 2014, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var child_process = require("child_process");

var handler = module.exports = Object.create(PluginBase);

handler.extensions = ["go"];

handler.languages = ["golang"];

handler.maxCallInterval = handler.CALL_INTERVAL_BASIC;

handler.init = function(options, callback) {
    callback();
};

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    var child;
    try {
        child = child_process.execFile(
            "gofmt",
            doc ? ["-e"]: ["-e", path],
            function(err, stdout, stderr) {
                if (err && err.code === "ENOENT") {
                    err = new Error("No go/gofmt installation found");
                    err.code = "EFATAL";
                    return callback(err);
                }
    
                var markers = [];
                
                stderr.split("\n").forEach(function(line) {
                    var match = line.match(/^[^:]*:([^:]*):([^:]*): (.*)/);
                    if (!match)
                        return;
                    var row = match[1];
                    var column = match[2]; // unused, might go stale too soon
                    var message = match[3];
                    markers.push({
                        pos: { sl: row - 1 },
                        message: message,
                        level: "error"
                    });
                });
                
                callback(null, null, markers);
            }
        );
    }
    catch (err) {
        // Out of memory or other fatal error?
        err.code = "EFATAL";
        return callback(err);
    }
    
    child.stdin.on("error", function(e) {
        // Ignore; execFile will handle process result
    });
    
    if (doc)
        child.stdin.end(doc);
};

});