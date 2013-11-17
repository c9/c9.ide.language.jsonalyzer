define(function(require, exports, module) {

var fileIndexer = require("./file_indexer");
var assert = require("plugins/c9.util/assert");
var handler;

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.outline = function(doc, ast, callback) {
    return fileIndexer.analyzeCurrent(handler.path, doc.getValue(), ast, {}, function(err, entry) {
        var result = createOutline(null, entry);
        result.isGeneric = true;
        callback(result);
    });
};

function createOutline(name, entry) {
    var result = {
        icon: entry.icon || entry.kind,
        name: name,
        pos: { sl: entry.row, sc: entry.column },
        items: []
    };
    if (!entry.properties)
        return result;
    assert(!Array.isArray(entry.properties));
    for (var uname in entry.properties) {
        entry.properties[uname].forEach(function(prop) {
            result.items.push(createOutline(uname.substr(1), prop));
        });
    }
    return result;
}

});