define(function(require, exports, module) {

var architectPlugins;

module.exports.init = function(jsonalyzer) {
    jsonalyzer.sender.on("architectPlugins", function(e) {
        architectPlugins = e.data;
    });
};

module.exports.findImports = function(path, doc, ast) {
    var baseDirMatch = path.match(/(.*\/)plugins\//);
    if (!baseDirMatch || !architectPlugins)
        return [];
    var results = [];
    ast && ast[0] && ast[0].rewrite('Call(_, [Function(_, _, body)]', function(b) {
        for (var j = 0; j < b.body.length; j++) {
            if (b.body[j].cons !== "Assign")
                continue;
            b.body[j].rewrite(
                'Assign(PropAccess(Var("main"), "consumes"), Array(consumes))',
                function(b, node) {
                    for (var i = 0; i < b.consumes.length; i++) {
                        var consume = b.consumes[i];
                        if (consume.cons !== "String")
                            continue;
                        var result = architectPlugins["_" + consume[0].value];
                        if (result)
                            results.push(baseDirMatch[1] + result + ".js");
                    }
                }
            );
        }
    });
    return results;
};



});