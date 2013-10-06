/**
 * fallback jumptodef worker
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var inferJumpToDef = require("ext/jsinfer/infer_jumptodef");
var outline = require("ext/jslanguage/outline");
var index = require("ext/jsonalyzer/worker/semantic_index");
var jsonalyzer /*: require("ext/jsonalyzer/jsonalyzer")*/;

module.exports.init = function(worker) {
    jsonalyzer = worker;
};

module.exports.jumpToDefinitionFallback = function(doc, fullAst, pos, currentNode, callback) {
    if (!fullAst || !currentNode)
        return callback();

    var property = getPropertyName(currentNode);
    var isCall = currentNode.parent && currentNode.parent.cons === "Call";
    if (!property)
        return callback();

    var results = [];
    
    var outlineNodes = outline.outlineSync(doc, fullAst, !isCall);
    results = findInOutline(outlineNodes, property, isCall, results);
    if (results.length)
        return callback(results);
    
    jsonalyzer.findImports(doc, fullAst, true, function(imports) {
        var summaries = index.getAssociatedSummaries(imports);
        results = findInSummaries(summaries, property, results);
        callback(results);
    });
};

function findInSummaries(summaries, property, results) {
    for (var i = 0; i < summaries.length; i++) {
        inferJumpToDef.jumpToProperty(summaries[i], property, results);
    }
    return results;
}

function findInOutline(outline, property, isCall, results) {
    var propertyPattern = property.replace(/[^A-Za-z0-9_$]/g, ".");
    var propertyRegex = new RegExp("^" + propertyPattern + (isCall ? "\\(" : "$"));
    return findInOutlineBody(outline, propertyRegex, results);
}
    
function findInOutlineBody(outline, propertyRegex, results) {
    for (var i = 0; i < outline.length; i++) {
        if (propertyRegex.test(outline[i].name))
            results.push({ row: outline[i].pos.sl, column: outline[i].pos.sc });
        if (outline[i].items)
            findInOutlineBody(outline[i].items, propertyRegex, results);
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
