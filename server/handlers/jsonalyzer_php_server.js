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

handler.extensions = ["php", "php3", "php4", "php5"];

handler.languages = ["php"];

handler.maxCallInterval = handler.CALL_INTERVAL_BASIC;

handler.init = function(options, callback) {
    callback();
};

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    var child;
    try {
        child = child_process.execFile(
            "php",
            doc ? ["-l"]: ["-l", path],
            function(err, stdout, stderr) {
                if (err && err.code === "ENOENT") {
                    err = new Error("No php installation found");
                    err.code = "EFATAL";
                    return callback(err);
                }
    
                var markers = [];
                
                (stdout + stderr).split("\n").forEach(function(line) {
                    var match = line.match(/^(?:Parse error: )?(.*?) in (?:.*?) on line (\d+)/);
                    if (!match)
                        return;
                    var message = match[1];
                    var row = match[2];
                    markers.push({
                        pos: { sl: parseInt(row, 10) - 1 },
                        message: message,
                        level: message.match(/error/) ? "error": "warning"
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