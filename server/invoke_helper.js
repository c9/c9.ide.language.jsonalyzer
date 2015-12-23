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
var workspaceDir;
 
handler.extensions = [];

handler.languages = [];

handler.maxCallInterval = handler.CALL_INTERVAL_MIN;

handler.init = function(options, callback) {
    workspaceDir = options.workspaceDir;
    callback();
};

handler.invoke = function(path, doc, ast, options, callback) {
    if (options.overrideLine != null) {
        var lines = doc.toString().split(/\r\n|\n|\r/);
        if (lines[options.overrideLineRow] !== options.overrideLine) {
            lines[options.overrideLineRow] = options.overrideLine;
            doc = lines.join("\n");
        }
    }
    if (options.cwd && options.cwd[0] != "/")
        options.cwd = workspaceDir + "/" + options.cwd;
    
    if (options.mode !== "tempfile")
        return this.$doInvoke(path, doc, options, callback);

    var tempFile = getTempFile() + paths.extname(path);
    var that = this;
    fs.writeFile(tempFile, doc, "utf8", function(err) {
        if (err) {
            err.code = "EFATAL";
            return callback(err);
        }
        that.$doInvoke(tempFile, doc, options, function(err, stdout, stderr, meta) {
            fs.unlink(tempFile, function(err2) {
                if (err2) console.error(err2);
                callback(err, stdout, stderr, meta);
            });
        });
    });
};

handler.$doInvoke = function(path, doc, options, callback) {
    var start = Date.now();
    this.$lint(
        options.command,
        (options.args || []).map(function(arg) {
            return arg.replace(/\$FILE\b/, path);
        }),
        options.mode != "tempfile" && doc,
        options,
        function(err, stdout, stderr, originalErr) {
            if (options.memoStrings) {
                stdout = doMemoStrings(stdout);
                stderr = doMemoStrings(stderr);
            }
            
            callback(err || originalErr, stdout, stderr, Date.now() - start);
        }
    );
    
    function doMemoStrings(string) {
        try {
            var json = JSON.parse(string);
            return JSON.stringify(memoStrings(
                json, options.memoStrings.dictStart, options.memoStrings.dictLength
            ));
        }
        catch (e) {
            return string;
        }
    }
};
        
function getTempFile() {
    return TEMPDIR + pathSep + "c9_invoke_" + crypto
        .randomBytes(6)
        .toString("base64")
        .slice(0, 6)
        .replace(/[+\/]+/g, "");
}

var dict = [];
function memoStrings(json, dictStart, dictLength) {
    dict = dict.slice(dictStart, dictLength);
    var newDictStart = dictLength;
    var dictMap = {};
    dict.forEach(function(value, index) {
        dictMap["_" + value] = index;
    });
    
    return {
        json: memoObject(json),
        dict: dict.slice(newDictStart),
        dictStart: newDictStart
    };
    
    function memoObject(json) {
        if (Array.isArray(json))
            return json.map(memoObject);
        var result = {};
        for (var key in json) {
            var key2 = memoValue(key);
            var value = json[key];
            var value2;
            if (typeof value === "object") {
                value2 = memoObject(value);
            }
            else if (typeof value === "number"
                || (typeof value === "string" && value.length > 5)) {
                value2 = memoValue(value);
            }
            else {
                value2 = value;
            }
            result[key2] = value2;
        }
        return result;
    }
            
    function memoValue(value) {
        var result = dictMap["_" + value];
        if (!result) {
            result = dictLength++;
            dictMap["_" + value] = result;
            dict[result] = value;
        }
        return result;
    }
}

});