define(function(require, exports, module) {

var index = require("./semantic_index");
var fileIndexer = require("./file_indexer");
var completeUtil = require("plugins/c9.ide.language/complete_util");
var workerUtil = require("plugins/c9.ide.language/worker_util");
var ctagsUtil = require("./ctags/ctags_util");
var handler;

var PRIORITY_LOW = 1;
var PRIORITY_HIGH = 2;

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.complete = function(doc, fullAst, pos, currentNode, callback) {
    var lines = doc.getAllLines();
    var docValue = doc.getValue();
    var line = lines[pos.row];
    var identifier = completeUtil.retrievePrecedingIdentifier(line, pos.column, workerUtil.getIdentifierRegex());
    
    fileIndexer.analyzeCurrent(handler.path, docValue, fullAst, { isComplete: true }, function(err, result, imports) {
        if (err)
            console.log("[jsonalyzer] Warning: could not analyze " + handler.path + ": " + err);
        var currentFile = result;
        var currentResults = getCompletionResults(null, PRIORITY_HIGH, identifier, currentFile);
        var otherResults = [];
        imports.forEach(function(path) {
            var summary = index.get(path);
            if (summary)
                otherResults = otherResults.concat(
                    getCompletionResults(path, PRIORITY_LOW, identifier, summary));
        });
        callback(currentResults.concat(otherResults));

        // Try to fetch any additional imports, and reopen the completer if needed
        var unresolved = imports.filter(function(i) { return !index.get(i); });
        if (unresolved.length) {
            fileIndexer.analyzeOthers(unresolved, true, function() {
                workerUtil.completeUpdate(pos, line);
            });
        }
    });
};

function getCompletionResults(path, priority, identifier, summary) {
    var entries = index.findEntries(summary, identifier, true);
    var file = path && path.match(/[^\/]*$/)[0];
    
    var results = [];
    for (var uname in entries) {
        entries[uname].forEach(function(e) {
            results.push(toCompletionResult(file, uname.substr(1), priority, e));
        });
    }
    return results;
}

function toCompletionResult(file, name, priority, entry) {
    var fullName = entry.guessFargs
        ? name + ctagsUtil.guessFargs(entry.docHead, name)
        : name;
    
    return {
        id          : name,
        name        : fullName,
        replaceText : name,
        icon        : "unknown2",
        meta        : file,
        doc         : entry.doc,
        docHead     : entry.docHead,
        priority    : priority,
        isGeneric   : true
    };
}

});