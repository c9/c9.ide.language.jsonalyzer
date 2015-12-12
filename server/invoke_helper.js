/**
 * jsonalyzer invocation helper used by {@link language.worker_util#execAnalysis}
 *
 * @copyright 2015, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");
var paths = require("path");
var fs = require("fs");
var pathSep = require("path").sep;
var TEMPDIR = process.env.TMP || process.env.TMPDIR || process.env.TEMP || '/tmp';

var handler = module.exports = Object.create(PluginBase);

handler.extensions = [];

handler.languages = [];

handler.maxCallInterval = handler.CALL_INTERVAL_MIN;

handler.invoke = function(path, doc, ast, options, callback) {
    if (options.useStdin)
        return this.$doInvoke(path, doc, options, callback);

    var tempFile = getTempFile() + paths.extname(path);
    var that = this;
    fs.writeFile(tempFile, doc, "utf8", function(err) {
        if (err) {
            err.code = "EFATAL";
            return callback(err);
        }
        that.$doInvoke(tempFile, doc, options, function(err, stdout, stderr) {
            fs.unlink(tempFile, function(err2) {
                if (err2) console.error(err2);
                callback(err, stdout, stderr);
            });
        });
    });
};

handler.$doInvoke = function(path, doc, options, callback) {
    this.$lint(
        options.command,
        (options.args || []).map(function(arg) {
            return arg.replace(/\$FILE\b/, path);
        }),
        options.useStdin && doc,
        callback
    );
};
        
function getTempFile() {
    return TEMPDIR + pathSep + "c9_invoke_" + crypto
        .randomBytes(6)
        .toString("base64")
        .slice(0, 6)
        .replace(/[+\/]+/g, "");
}

});