/**
 * jsonalyzer shell analysis
 *
 * @copyright 2014, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var child_process = require("child_process");

var handler = module.exports = Object.create(PluginBase);
var bashBin;

handler.extensions = ["sh"];

handler.languages = ["sh"];

handler.init = function(options, callback) {
    bashBin = options.bashBin;
    callback();
};

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    var child = child_process.execFile(
        bashBin,
        doc ? ["-n"] : ["-n", path],
        function(err, stdout, stderr) {
            if (err && err.code !== 2) return callback(err);

            var ignoreRows = {};
            var markers = [];
            
            stderr.split("\n").forEach(function(line) {
                var match = line.match(/^([^:]+):\s*(?:line\s*)?([^:]+):\s*(.*)/);
                if (!match)
                    return;
                var row = match[2];
                var message = match[3];
                if (ignoreRows[row]) {
                    ignoreRows[row] = null; // ignore second message of each row
                    return;
                }
                ignoreRows[row] = true;
                markers.push({
                    pos: { sl: parseInt(row, 10) - 1 },
                    message: message,
                    level: message.match(/error/) ? "error" : "warning"
                });
            });
            
            callback(null, null, markers);
        }
    );
    if (doc)
        child.stdin.end(doc);
};

});