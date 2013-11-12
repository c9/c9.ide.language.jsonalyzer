/**
 * JSonalyzer languages index: defines all jsonalyzer languages plugins
 * Register additional plugins using jsonalyzer_worker.register().
 */
define(function(require, exports, module) {

module.exports = [
    require("plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_js"),
    //require("plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_generic"),
    require("plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_php"),
    require("plugins/c9.ide.language.jsonalyzer/worker/handlers/jsonalyzer_ctags"),
];

});