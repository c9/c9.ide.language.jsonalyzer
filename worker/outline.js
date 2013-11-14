define(function(require, exports, module) {

var index = require("./semantic_index");
var fileIndexer = require("./file_indexer");
var handler;

var PRIORITY_LOW = 1;
var PRIORITY_HIGH = 2;

module.exports.init = function(_handler) {
    handler = _handler;
};

module.exports.outline = function(doc, ast, callback) {
    var _self = this;
    var entry = index.get(handler.path);
    if (!entry) {
        return fileIndexer.analyzeCurrent(handler.path, doc.getValue(), ast, {}, function(err, result) {
            _self.outline(doc, ast, callback);
        });
    }
    var result = createOutline(null, entry);
    result.isGeneric = true;
    callback(result);
};

function createOutline(name, entry) {
    var result = {
        icon: entry.icon,
        name: name,
        pos: { sl: entry.row, sc: entry.column },
        items: []
    };
    if (!entry.properties)
        return result;
    for (var uname in entry.properties) {
        entry.properties[uname].forEach(function(prop) {
            result.items.push(createOutline(uname.substr(1), prop));
        });
    }
    return result;
}

});