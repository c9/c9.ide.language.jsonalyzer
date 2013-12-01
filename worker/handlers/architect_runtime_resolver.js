var globalRequire = require;

/**
 * Architect module resolver for Cloud9 source code,
 * using runtime information from the running Cloud9.
 * It's not perfect but it's simple.
 */
define(function(require, exports, module) {

var plugins = {};

var inited;
function init() {
    if (inited) return;
    inited = true;
    globalRequire.plugins.forEach(function(plugin) {
        if (!plugin || !plugin.provides)
            return;
        plugin.provides.forEach(function(provide) {
            plugins["_" + provide] = plugin.packagePath;
        });
    });
}

module.exports.findImports = function(path, doc, ast) {
    var baseDirMatch = path.match(/(.*\/)plugins\//);
    if (!baseDirMatch)
        return [];
    var results = [];
    ast && ast[0] && ast[0].rewrite('Call(_, [Function(_, _, body)]', function(b) {
        b.body[0] && b.body[0].rewrite('Assign(PropAccess(Var("main"), "consumes"), Array(consumes))', function(b) {
            init();
            for (var i = 0; i < b.consumes.length; i++) {
                var consume = b.consumes[i];
                if (consume.cons !== "String")
                    return;
                var result = plugins["_" + consume[0].value];
                if (result)
                    results.push(baseDirMatch[1] + result + ".js");
            }
        });
    });
    return results;
};



});