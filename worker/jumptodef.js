/**
 * jsonalyzer jumptodef handler
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var index = require("./semantic_index");
var handler /*: require("plugins/c9.ide.language.jsonalyzer/jsonalyzer")*/;
var worker = require("plugins/c9.ide.language/worker");
var fileIndexer = require("./file_indexer");
var workerUtil = require("plugins/c9.ide.language/worker_util");

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.jumpToDefinition = function(doc, fullAst, pos, currentNode, callback) {
    var line = doc.getLine(pos.row);
    var docValue = doc.getValue();
    var identifier = workerUtil.getIdentifier(line, pos.column);

    // We're first getting the very latest outline, which might come
    // from us or from another outliner, and we'll use it as a local
    // list of definitions to jump to.
    worker.$lastWorker.getOutline(function(outline) {
        var results = outline && outline.items
            ? findInOutline(outline.items, identifier)
            : [];
        
        // Next, get results based on the summaries of our imports
        fileIndexer.analyzeCurrent(handler.path, docValue, fullAst, {}, function(err, result, imports) {
            if (err) {
                console.error(err);
                return callback(results);
            }

            // We only actually download & analyze new files if really needed
            var needAllImports = !results.length;
            if (needAllImports)
                fileIndexer.analyzeOthers(imports, needAllImports, done);
            else
                done();
            
            function done() {
                var summaries = index.getAny(imports);
                results = findInSummaries(summaries, identifier, results);
                if (doc.region)
                    results.forEach(function(result) {
                        result.row -= doc.region.sl;
                    });
                callback(results);
            }
        });
    });
};

function findInSummaries(summaries, identifier, results) {
    summaries.forEach(function(summary) {
        var entries = index.findEntries(summary, identifier);
        for (var uname in entries) {
            entries[uname].forEach(function(entry) {
                results.push({
                    row: entry.row,
                    column: entry.column,
                    path: summary.path,
                    icon: entry.icon
                        || entry.kind === "package" && "package"
                        || entry.kind === "event" && "event"
                        || "unknown2",
                    isGeneric: true
                });
            });
        }
    });
    return results;
}

function isNameMatch(identifier, indexName) {
    // TODO: consider index names like foo.bar or foo()
    return identifier === indexName;
}

function findInOutline(outline, identifier, results) {
    if (!results)
        results = [];
    for (var i = 0; i < outline.length; i++) {
        if (isNameMatch(identifier, outline[i].name)) {
            results.push({
                row: outline[i].pos.sl,
                column: outline[i].pos.sc,
                icon: outline[i].icon,
                isGeneric: true
            });
        }
        if (outline[i].items)
            findInOutline(outline[i].items, results);
    }
    return results;
}

function getPropertyName(node) {
    var result;
    node.rewrite(
        'PropAccess(o, p)', function(b) {
            result = b.p.value; 
        }
    );
    return result;
}

});
