/**
 * JSonalyzer languages index: defines all jsonalyzer languages plugins
 * Register additional plugins using jsonalyzer_worker.register().
 */
define(function(require, exports, module) {

module.exports = [
    require("ext/jsonalyzer/languages/jsonalyzer_js"),
    require("ext/jsonalyzer/languages/jsonalyzer_generic")
];

});