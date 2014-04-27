define(function(require, exports, module) {

var assert = require("c9/assert");

module.exports.HandlerRegistry = function() {
    var plugins = [];
    var supportedLanguages = "";
    var supportedExtensions = "";
    
    return {
        registerPlugin: function(plugin, owner) {
            if (plugins.indexOf(plugin) > -1)
                return;
            
            plugin.init && plugin.init(owner);
        
            var languages = plugin.languages;
            var extensions = plugin.extensions;
            assert(languages && extensions, "Plugins must have a languages and extensions property");
            
            plugin.supportedLanguages = "";
            plugin.supportedExtensions = "";
            plugins.push(plugin);
            languages.forEach(function(e) {
                supportedLanguages += (supportedLanguages ? "|^" : "^") + e;
                plugin.supportedLanguages += (plugin.supportedLanguages ? "|^" : "^") + e + "$";
            });
            extensions.forEach(function(e) {
                supportedExtensions += (supportedExtensions ? "|^" : "^") + e + "$";
                plugin.supportedExtensions += (plugin.supportedExtensions ? "|^" : "^") + e + "$";
            });
        },
        
        getPluginFor: function(path, language) {
            var match = path && path.match(/\.([^/.]*)$/);
            var extension = match && match[1] || "";
            if (!extension.match(supportedExtensions) && !(language || "").match(supportedLanguages))
                return null;
            
            var results = plugins.filter(function(p) {
                return language && language.match(p.supportedLanguages);
            }).concat(
            plugins.filter(function(p) {
                return extension.match(p.supportedExtensions)
                    && (!p.supportedPaths || (path && path.match(p.supportedPaths)));
            }));
            
            // Defer ctags plugin
            if (results.length > 1)
                results = results.filter(function(r) { return !r.isGeneric; });
            
            return results[0];
        },
        
        getAllPlugins: function() {
            return plugins;
        }
    
    };
};

});