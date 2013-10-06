/**
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var editors = require("ext/editors/editors");
var language = require("ext/language/language");
var linereport = require("ext/linereport/linereport");
var jsinfer = require("ext/jsinfer/jsinfer");

module.exports = ext.register("ext/jsonalyzer/jsonalyzer", {
    name    : "Multi-file analysis core",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    deps    : [editors, language, linereport, jsinfer],
    nodes   : [],
    alone   : true,

    init : function() {
        var _self = this;
        ide.addEventListener("init.ext/language/language", function() {
            language.registerLanguageHandler("ext/jsonalyzer/worker/jsonalyzer_worker");
            ide.addEventListener("beforewatcherchange", _self.onFileChange.bind(_self));
            ide.addEventListener("afterfilesave", _self.onFileSave.bind(_self));
            ide.addEventListener("treechange", _self.onDirChange.bind(_self));
            ide.addEventListener("afteronline", _self.onOnlineChange.bind(_self));
            ide.addEventListener("afteroffline", _self.onOnlineChange.bind(_self));
            _self.onOnlineChange();
        });
    },
    
    onFileChange: function(event) {
        language.worker.emit("filechange", {data: {path: event.path}});
    },
    
    onFileSave: function(event) {
        if (!event.silentsave)
            language.worker.emit("filechange", {data: {path: event.oldpath, isSave: true}});
    },
    
    onDirChange: function(event) {
        language.worker.emit("dirchange", {data: event});
    },
    
    onOnlineChange: function() {
        language.worker.emit("onlinechange", {data: {isOnline: ide.onLine}});
        // Make sure a current state arrives last in the worker
        setTimeout(function() {
            language.worker.emit("onlinechange", {data: {isOnline: ide.onLine}});
        }, 3000);
    }
});

});
