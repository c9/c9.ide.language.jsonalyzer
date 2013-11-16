define(function(require, exports, module) {

var index = require("./semantic_index");
var fileIndexer = require("./file_indexer");
var workerUtil = require("plugins/c9.ide.language/worker_util");
var handler;

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.onRefactoringTest = function(doc, fullAst, pos, currentNode, callback) {
    getEntry(doc, fullAst, pos, function(pos, identifier, entry) {
        callback({ enableRefactorings: entry ? ["renameVariable"] : [] });
    });
};

module.exports.getRenamePositions = function(doc, fullAst, pos, currentNode, callback) {
    getEntry(doc, fullAst, pos, function(pos, identifier, entry) {
        if (!entry)
            return callback();
        workerUtil.getTokens(doc, [identifier, identifier+"()"], function(err, results) {
            if (err)
                callback();
            callback({
                length: identifier.length,
                pos: pos,
                others: results,
                isGeneric: true
            });
        })
    });
};

module.exports.commitRename = function(doc, oldId, newName, isGeneric, callback) {
    if (!isGeneric)
        return callback();
    var summary = index.flattenIndexEntry(index.get(handler.path));
    if (!summary)
        return callback();
    callback(summary["_" + newName] && "Name '" + newName + "' is already used.");
}

function getEntry(doc, fullAst, pos, callback) {
    if (handler.language === "javascript") // optimization
        return callback();
    
    var docValue = doc.getValue();
    var line = doc.getLine(pos.row);
    var identifier = workerUtil.getIdentifier(line, pos.column);
    var prefix = workerUtil.getPrecedingIdentifier(line, pos.column);
    var pos = { row: pos.row, column: pos.column - prefix.length };
    
    fileIndexer.analyzeCurrent(handler.path, docValue, fullAst, { isComplete: true }, function(err, result) {
        if (err)
            console.log("[jsonalyzer] Warning: could not analyze " + handler.path + ": " + err);
        var summary = index.flattenIndexEntry(result);
        var entry = summary["_" + identifier];
        if (!entry)
            return callback();
        callback(pos, identifier, entry);
    });
    
}

});