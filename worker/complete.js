define(function(require, exports, module) {

var index = require("./semantic_index");
var fileIndexer = require("./file_indexer");
var completeUtil = require("plugins/c9.ide.language/complete_util");
var workerUtil = require("plugins/c9.ide.language/worker_util");
var handler;

var PRIORITY_LOW = 1;
var PRIORITY_HIGH = 2;

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.complete = function(doc, fullAst, pos, currentNode, callback) {
    var lines = doc.getAllLines();
    doc = doc.getValue();
    var line = lines[pos.row];
    var identifier = completeUtil.retrievePrecedingIdentifier(line, pos.column, workerUtil.getIdentifierRegex());
    
    fileIndexer.findImports(handler.path, doc, fullAst, false, function(err, imports) {
        if (err) {
            console.error(err);
            return callback();
        }
        fileIndexer.analyzeCurrent(handler.path, doc, fullAst, { isComplete: true }, function(err, result) {
            if (err)
                console.log("[jsonalyzer] Warning: could not analyze " + handler.path + ": " + err);
            var currentFile = index.flattenIndexEntry(result);
            var currentResults = getCompletionResults(handler.path, PRIORITY_HIGH, identifier, currentFile);
            var otherResults = [];
            imports.forEach(function(path) {
                // TODO: optimize -- avoid flatten here?
                var flatEntry = index.flattenIndexEntry(index.get(path));
                if (flatEntry)
                    otherResults = otherResults.concat(
                        getCompletionResults(path, PRIORITY_LOW, identifier, flatEntry));
            });
            callback(currentResults.concat(otherResults));
        });
        
        // Try to fetch any additional imports, and reopen the completer if needed
        var unresolved = imports.filter(function(i) { return !index.get(i); });
        if (unresolved.length) {
            fileIndexer.analyzeOthers(unresolved, true, function() {
                workerUtil.completeUpdate(pos, line);
            });
        }
    });
};
function getCompletionResults(path, priority, identifier, flatEntry) {
    var allIdentifiers = Object.keys(flatEntry);
    var completions = completeUtil.findCompletions("_" + identifier, allIdentifiers);
    var file = path.match(/[^\/]*$/)[0];
    
    var results = [];
    completions.forEach(function(uname) {
        flatEntry[uname].forEach(function(e) {
            results.push(toCompletionResult(file, uname.substr(1), priority, e));
        });
    });
    return results;
}

function toCompletionResult(file, name, priority, entry) {
    // TODO: arg names?
    return {
        name        : name,
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