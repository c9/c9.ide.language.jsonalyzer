/**
 * jsonalyzer shell analysis
 *
 * @copyright 2014, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var PluginBase = require("plugins/c9.ide.language.jsonalyzer/worker/jsonalyzer_base_handler");

var handler = module.exports = Object.create(PluginBase);

handler.extensions = ["sh"];

handler.languages = ["sh"];

handler.analyzeCurrent = function(path, doc, ast, options, callback) {
    callback();
};

});