/**
 * jsonalyzer jumptodef handler
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var index = require("./semantic_index");
var handler /*: require("plugins/c9.ide.language.jsonalyzer/jsonalyzer")*/;
var fileIndexer = require("./file_indexer");
var workerUtil = require("plugins/c9.ide.language/worker_util");

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.highlightOccurrences = function(doc, fullAst, pos, currentNode, callback) {
    var summary = index.get(handler.path);
    if (!summary)
        return callback(); // we're closed, come back later
        
    var line = doc.getLine(pos.row);
    var identifier = workerUtil.getIdentifier(line, pos.column);
    
    var entries = index.hasEntries(identifier);
    if (Object.keys(entries).length)
        return callback(getOccurrences(pos, identifier, entries["_" + identifier]));
    
    var imports = index.getImports(handler.path);
    var others = index.getAny(imports);
    for (var i = 0; i < others.length; i++) {
        if (index.hasEntries(others[i], identifier))
            return callback(pos, identifier, []);
    }
    
    callback();
};

function getOccurrences(pos, identifier, entryList) {
    debugger
}

});
