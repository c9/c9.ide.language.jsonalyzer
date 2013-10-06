/**
 * jsonalyzer worker
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var baseLanguageHandler = require("ext/linereport/linereport_base");
var index = require("ext/jsonalyzer/worker/semantic_index");
var plugins = require("ext/jsonalyzer/languages/index");
var jumptodef = require("ext/jsonalyzer/worker/jumptodef_generic");
require("treehugger/traverse"); // add traversal methods

var VERSION = "14";
var INSTALL_DIR = "~/.c9/cache/jsonalyzer";
var CACHE_DIR = "~/.c9/cache/jsonalyzer-cache";
var JSONALYZER = "node " + INSTALL_DIR + "/jsonalyzer.js";
var JSONALYZER_ALL = INSTALL_DIR + "/bin/jsonalyzer-all";
var JSONALYZER_KILL = INSTALL_DIR + "/bin/jsonalyzer-kill";
var JSONALYZER_WATCH = "node " + INSTALL_DIR + "/tools/simple_watch.js";
var NICE = "`if which nice >/dev/null; then echo nice -10; fi`";
var DOWNLOAD_URL = "http://c9.github.com/jsonalyzer/jsonalyzer.tar.gz";
var OPENSHIFT_DIR = "/usr/libexec/openshift";
var OPENSHIFT_JSONALYZER_DIR = OPENSHIFT_DIR + "/cartridges/c9-0.1/root/jsonalyzer/" + VERSION;
var UNKNOWN_GUID = "$unknown$";
var GUID_PREFIX = "project:";
var KIND_PACKAGE = require('ext/jslanguage/scope_analyzer').KIND_PACKAGE;
var KIND_HIDDEN = require('ext/jslanguage/scope_analyzer').KIND_HIDDEN;
var KIND_DEFAULT = require('ext/jslanguage/scope_analyzer').KIND_DEFAULT;
var MODULES_TIMEOUT = 2 * 60 * 1000;
var PACKAGES_TIMEOUT = 3 * 60 * 1000;
var OFFLINE_TIMEOUT = 1500;
var INSTALL_TIMEOUT = 3 * 60 * 1000;
var AFTER_WATCHER_TIMEOUT = 1000;
var PACKAGE_RECHECK_INTERVAL = 25 * 1000;

var PARANOID_CHECK_SET = [
    ".git/index", ".hg/dirstate", ".svn/.wc.db", "node_modules/*", "package.json"
];

var handler = module.exports = Object.create(baseLanguageHandler);
var queuedShows = {};
var queuedLoads = [];
var isPackagesQueued = false;
var isParanoidAboutWatchers = false;
var asyncLastJobCallback = null;
var isJobActive = false;
var crashedJobTimeout;
var afterWatcherTimeout;
var isOnline = false;
var fetchPackagesRetried = false;
var fetchModulesRetried = false;

// Plugin configuration
var supportedExtensions = "";
var supportedLanguages = "";

handler.$isInited = false;

handler.DEBUG = true;

handler.KIND_DEFAULT = KIND_DEFAULT;

handler.KIND_PACKAGE = KIND_PACKAGE;

handler.registerPlugin = function(plugin, languages, guidName, extensions) {
    if (plugins.indexOf(plugin) === -1)
        plugins.push(plugin);
    plugin.guidName = guidName;
    plugin.guidNameRegex = new RegExp("^" + guidName + ":");
    plugin.supportedLanguages = [];
    languages.forEach(function(l) {
        supportedLanguages += "|" + l;
        if (supportedLanguages[0] === "|")
            supportedLanguages = supportedLanguages.substr(1);
        plugin.supportedLanguages.push(l);
    });
    extensions.forEach(function(e) {
        supportedExtensions += "|" + e;
        if (supportedLanguages[0] === "|")
            supportedLanguages = supportedLanguages.substr(1);
        plugin.supportedExtensions += "|" + e;
    });
};

handler.isEagerAnalysis = false;

handler.init = function(callback) {
    var _self = this;
    
    handler.sender.on("onlinechange", function(event) {
        _self.onOnlineChange(event);
    });
    
    isJobActive = true;
    installAnalyzer(function() {
        isJobActive = false;
        consumeFetchQueue();
    });
    
    enqueueFetchPackages(false);
    
    handler.sender.on("filechange", function(event) {
        _self.onFileChange(event);
    });
    handler.sender.on("dirchange", function(event) {
        _self.onDirChange(event);
    });
    handler.sender.on("change", function(event) {
        _self.onBufferChange(event);
    });
    
    // Since we don't really trust the watchers, we fire off
    // a paranoid check every so often to check for changes
    setInterval(function() {
        if (!isPackagesQueued || !isJobActive) {
            enqueueFetchPackages(true);
        }
    }, PACKAGE_RECHECK_INTERVAL);
    
    index.init(_self);
    jumptodef.init(_self);
    plugins.forEach(function(p) {
        p.init(_self);
    });
    
    // Calling the callback to register/activate the plugin
    // (calling it late wouldn't delay anything else)
    callback();
};

handler.handlesLanguage = function(language) {
    return language.match(supportedLanguages);
};

handler.analyze = function(doc, ast, callback) {
    if (handler.disabled || !ast)
        return callback();
    // Only eagerly analyze if the current file was actually edited
    if (!handler.isEagerAnalysis)
        return callback();
        
    this.findImports(doc, ast, true, function(imports) {
        if (imports.length)
            enqueueFetchModules(imports, null);
    });
    
    callback(); // don't block other analyses
};

handler.complete = function(doc, fullAst, pos, currentNode, callback) {
    if (handler.disabled || !currentNode)
        return callback();
    
    var _self = this;
    this.findImports(doc, fullAst, true, function(imports) {
        if (imports.length) {
            enqueueFetchModules(imports, function() {
                _self.$completeUpdate(pos, doc.getLine(pos.row));
            });
        }
        callback();
    });
};

handler.onOnlineChange = function(event) {
    isOnline = event.data.isOnline;
},

handler.onFileChange = function(event) {
    if (handler.disabled)
        return;
    var path = event.data.path.replace(/^\/((?!workspace)[^\/]+\/[^\/]+\/)?workspace\//, "");
    var guid = index.analyzedModules["_" + path];
    
    if (!path.match(supportedExtensions))
        return;

    if (guid && guid !== UNKNOWN_GUID) {
        delete index.analyzedModules["_" + path];
        if (index.analyzedModules["_" + guid])
            delete index.analyzedModules["_" + guid];
        if (index.longSummaries[guid])
            delete index.longSummaries[guid];
        // Restore short summary in package summary collection
        index.shortSummaries[guid] = {
            guid: guid,
            path: path,
            kind: KIND_PACKAGE
        };
    }

    if (event.data.isSave)
        return;
    
    // Always queue it for reloading (not reanalysis)
    queuedLoads["_" + path] = path;
    
    // Wait a bit after getting watcher events so they aren't processed one-by-one
    clearTimeout(afterWatcherTimeout);
    afterWatcherTimeout = setTimeout(function() {
        consumeFetchQueue();
    }, AFTER_WATCHER_TIMEOUT);
},

handler.onDirChange = function(event) {
    // TODO: Optimize - don't update the entire file tree
    //       (but we can only do that if we have proper watchers for all the tree
    //       and not flaky ones only for the visible parts)
    
    // Wait a bit after getting watcher events so they aren't processed one-by-one
    clearTimeout(afterWatcherTimeout);
    afterWatcherTimeout = setTimeout(function() {
        if (!isPackagesQueued || !isJobActive) {
            // HACK: depending on the configuration, doing the analysis
            //       may trigger a /workspace dirChange event,
            //       so we're paranoid about those
            var paranoid = !!event.data.path.match(/\/workspace/);
            enqueueFetchPackages(paranoid);
        }
    }, AFTER_WATCHER_TIMEOUT);
};

handler.onBufferChange = function(event) {
    handler.isEagerAnalysis = true;
};

handler.onDocumentOpen = function(path, doc, oldPath, callback) {
    if (path !== oldPath)
        handler.isEagerAnalysis = false;
    callback();
};

handler.getJsonalyzerTarget = function() {
    // Create a safe, readable name
    var name = handler.workspaceDir.replace(/.*\/([^\/]+)$/, "$1").replace(/[^A-Za-z0-9\-_$]/g, "");
    return CACHE_DIR + "/" + name + "-" + Math.abs(getStringHash(handler.workspaceDir));
};

handler.findImports = function(doc, ast, excludeAnalyzed, callback) {
    var plugin = getPluginFor(this.language);
    var _self = this;
    plugin.findImports(doc, ast, function(results) {
        if (!excludeAnalyzed)
            return results;
        results = results.filter(function(result) {
            var analyzed = index.analyzedModules["_" + result];
            if (analyzed && analyzed !== _self.UNKNOWN_GUID)
                return false;
            var isFilePath = !result.match(plugin.guidNameRegex);
            if (isFilePath && (!isPackagesQueued || isParanoidAboutWatchers) && !index.knownPathCache["_" + result])
                return false;
            if (!isFilePath && (!isPackagesQueued || isParanoidAboutWatchers) &&
                index.shortSummaries && !index.shortSummaries[result] && !index.longSummaries[result])
                return false;
            return true;
        });
        callback(results);
    });
};

var getPluginFor = handler.getPluginFor = function(language) {
    var results = plugins.filter(function(p) {
        return p.supportedLanguages.indexOf(language) > -1;
    });
    switch (results.length) {
        case 1: return results[0];
        case 0: throw new Error("No jsonalyzer plugin for " + language);
        default: throw new Error("More than one jsonalyzer plugin registered for " + language);
    }
};

function getStringHash(str) {
    var res = 0;
    var len = str.length;
    for (var i = 0; i < len; i++) {
        res = res * 31 + str.charCodeAt(i);
        res = res & res;
    }
    return res;
}

/**
 * @param lastJobCallback Called if and only if the analysis completes
 *                        and this is the last job in the queue
 */
var enqueueFetchModules = module.exports.enqueueFetchLongSummaries = function(imports, lastJobCallback) {
    if (lastJobCallback)
        asyncLastJobCallback = lastJobCallback;
    
    for (var i = 0; i < imports.length; i++) {
        queuedShows["_" + imports[i]] = imports[i];
    }
    
    consumeFetchQueue();
};

/**
 * @param lastJobCallback Called if and only if the analysis completes
 *                        and this is the last job in the queue
 */
function enqueueFetchPackages(paranoid) {
    // Go into paranoid mode unless a non-paranoid fetch was scheduled
    isParanoidAboutWatchers = paranoid && (!isPackagesQueued || isParanoidAboutWatchers);
    
    isPackagesQueued = true;
    consumeFetchQueue();
}

function runOnceOnline(f) {
    if (isOnline) {
        f();
        return;
    }
    var check = setInterval(
        function() {
            if (!isOnline)
                return;
            clearInterval(check);
            f();
        },
        OFFLINE_TIMEOUT
    );
}
    
function consumeFetchQueue() {
    if (handler.disabled || isJobActive)
        return;
    
    function next() {
        if (isPackagesQueued) {
            crashedJobTimeout = setTimeout(function() {
                runOnceOnline(next);
            }, PACKAGES_TIMEOUT);
            isPackagesQueued = false;
            doFetchPackages(function() {
                clearTimeout(crashedJobTimeout);
                runOnceOnline(next);
            });
            return;
        }
            
        var toShow = toValueArray(queuedShows);
        var toLoad = toValueArray(queuedLoads);
        queuedShows = {};
        queuedLoads = {};
        
        if (toShow.length + toLoad.length === 0) {
            if (asyncLastJobCallback) {
                asyncLastJobCallback();
                asyncLastJobCallback = null;
            }
            isJobActive = false;
            return;
        }
        
        crashedJobTimeout = setTimeout(function() {
            index.removeModules(index.analyzedModules, toShow, true);
            runOnceOnline(next);
        }, MODULES_TIMEOUT);
        doFetchModules(toShow, toLoad, function() {
            clearTimeout(crashedJobTimeout);
            runOnceOnline(next);
        });
    }
    
    isJobActive = true;
    runOnceOnline(next);
}

var toValueArray = module.exports.toValueArray = function(object) {
    var results = [];
    for (var p in object) {
        if (object.hasOwnProperty(p))
            results.push(object[p]);
    }
    return results;
};

function doFetchModules(toShow, toLoad, callback) {
    var showCommands = [];
    for (var i = 0; i < toShow.length; i++) {
        if (index.analyzedModules["_" + toShow[i]])
            continue;
        showCommands.push("--show");
        showCommands.push(toShow[i]);
        index.analyzedModules["_" + toShow[i]] = UNKNOWN_GUID;
    }
    var loadCommands = [];
    for (var j = 0; j < toLoad.length; j++) {
        if (index.analyzedModules["_" + toLoad[j]])
            continue;
        loadCommands.push(toLoad[j]);
        index.analyzedModules["_" + toLoad[j]] = UNKNOWN_GUID;
    }
    
    if (showCommands.length + loadCommands.length === 0)
        return callback();
    
    handler.$invoke(
          JSONALYZER_KILL + ";" // kill any running instances
        + "time " + NICE + " " + JSONALYZER
        + " -s"
        + " -i " + handler.getJsonalyzerTarget()
        + " -o " + handler.getJsonalyzerTarget()
        + " " + showCommands.join(" ")
        + (showCommands.length ? "" : " -p ") + loadCommands.join(" "),
        null, function(code, stdout, stderr) {
            if (code) {
                console.error("[jsonalyzer] analysis failed:\n" + stderr);
                maybeRetryFetchModules(toShow, toLoad, callback);
            }
            else if (showCommands.length) {
                index.parseModules(toShow, toLoad, stdout, stderr, index.longSummaries, function(err, results) {
                    if (err) {
                        console.error("[jsonalyzer] Could not parse output:\n" + stdout + "\n" + stderr, err);
                        return maybeRetryFetchModules(toShow, toLoad, callback);
                    }
                    
                    if (results) {
                        index.longSummaries = results;
                        registerSummaries(KIND_DEFAULT, index.longSummaries);
                        // Some stuff may have been removed from shortSummaries; update them
                        registerSummaries(KIND_PACKAGE, index.shortSummaries);
                    }
                    callback();
                });
            }
            else {
                callback();
            }
        });
}

function doFetchPackages(callback) {
    var paranoidCommand = getParanoidWatcherCommand();
    var wasParanoid = isParanoidAboutWatchers;
    if (isParanoidAboutWatchers) {
        // Only do the analysis if the paranoid watcher says files changed
        isParanoidAboutWatchers = false;
        paranoidCommand += " && echo '{\"paranoidSkipped\": true}' || ";
    }
    else {
        // Just mark files as known
        paranoidCommand += ";";
    }
    
    handler.$invoke(
          paranoidCommand
        + "(" + JSONALYZER_KILL + ";" // kill any running instances
        + "time " + NICE + " " + JSONALYZER_ALL
        + " " + handler.workspaceDir
        + " -i " + handler.getJsonalyzerTarget()
        + " -o " + handler.getJsonalyzerTarget()
        + " -p"
        + " -s"
        + " --show package.json" + ")",
        null, function(code, stdout, stderr) {
            if (code) {
                console.log("[jsonalyzer] fetch failed:\n" + stderr);
                maybeRetryFetchPackages(wasParanoid, callback);
            }
            else {
                index.parsePackages(stdout, wasParanoid, function(err, results) {
                    if (err) {
                        console.error("[jsonalyzer] Could not parse output:\n" + stdout + "\n" + stderr, err);
                        return maybeRetryFetchPackages(wasParanoid, callback);
                    }
                    
                    fetchPackagesRetried = false; // allow another retry
                    
                    if (results) {
                        index.shortSummaries = results;
                        registerSummaries(KIND_PACKAGE, index.shortSummaries);
                    }
                    callback();
                });
            }
        });
}

function registerSummaries(kind, summaries, filenamesFilter) {
    plugins.forEach(function(plugin) {
        if (!plugin.guidNameRegex)
            return;
        if (filenamesFilter && !plugin.isOneExtensionSupported(filenamesFilter))
            return;
        var pluginSummaries = {};
        for (var summary in summaries) {
            if (summary.match(plugin.guidNameRegex))
                pluginSummaries[summary] = summaries[summary];
        }
        plugin.onReceivedSummaries(kind, pluginSummaries);
    });
}

/**
 * Install a remote jsonalyzer analyzer, making minimal assumptions
 * about what's installed remotely (consider SSH instances!).
 */
function installAnalyzer(callback) {
    var script = "\
        set -e                           \n\
                                         \n\
        # Kill any running installer     \n\
        for P in `ps ux | grep jsonalyzer-installer | grep -v $$ | \n\
                  sed -E 's/[^ ]+ +([0-9]+).*/\\1/'`; do \n\
          kill $P || :                   \n\
        done                             \n\
                                         \n\
        mkdir -p " + CACHE_DIR + " " + INSTALL_DIR + "\n\
        cd " + INSTALL_DIR + "/.. \n\
                                         \n\
        # Check current version, install new if needed \n\
        if [ `grep -Eo 'VERSION.?=.?\"?[0-9]+\"?' jsonalyzer/jsonalyzer.js | grep -Eo '[0-9]+' || echo 0` \
              -lt "+ VERSION + " ]; then    \n\
            if [ -e " + OPENSHIFT_DIR + " ] && [ -e " + OPENSHIFT_JSONALYZER_DIR + " ]; then \n\
                echo Installing jsonalyzer  \n\
                rm -rf jsonalyzer           \n\
                ln -s " + OPENSHIFT_JSONALYZER_DIR + " jsonalyzer \n\
                echo Linked jsonalyzer      \n\
            else                            \n\
                echo Downloading jsonalyzer \n\
                cd jsonalyzer               \n\
                curl -sSOL " + DOWNLOAD_URL + " \n\
                echo Installing jsonalyzer  \n\
                tar xzf jsonalyzer.tar.gz   \n\
            fi                              \n\
            if [ `grep -Eo 'VERSION.?=.?\"?[0-9]+\"?' jsonalyzer/jsonalyzer.js | grep -Eo '[0-9]+' || echo 0` \
              -lt "+ VERSION + " ]; then      \n\
              echo Warning: incorrect version \n\
            fi                                \n\
        fi";
    
    crashedJobTimeout = setTimeout(function() {
        console.error("[jsonalyzer] Could not install: timeout");
        callback();
    }, INSTALL_TIMEOUT);
    
    runOnceOnline(function() {
        if (handler.DEBUG)
            console.log("[jsonalyzer] init");
        handler.$invoke(
            script, null, function(code, stdout, stderr) {
                clearTimeout(crashedJobTimeout);
                
                if (code) {
                    console.error("[jsonalyzer] Could not install:\n" +
                        stdout + "\n" + stderr);
                    handler.disabled = true;
                }
                else if (handler.DEBUG && stdout.match(/Warning: incorrect version/))
                    console.log("[jsonalyzer] warning: incorrect version installed");
                else if (handler.DEBUG && stdout.match(/Installing/))
                    console.log("[jsonalyzer] installed");
                else if (handler.DEBUG)
                    console.log("[jsonalyzer] inited");
                callback();
            }
        );
    });
}

function getParanoidWatcherCommand() {
    var paranoidFiles = PARANOID_CHECK_SET.map(function (v) {
        return handler.workspaceDir + "/" + v;
    });
    return JSONALYZER_WATCH
        + " " + handler.getJsonalyzerTarget() + "-watch"
        + " " + paranoidFiles.join(" ")
        + " `find . -maxdepth 1 -type d | grep -Ev '^\\./\\.c9|^\\.$' || echo ''`";
}

function maybeRetryFetchPackages(paranoid, callback) {
    if (fetchPackagesRetried)
        return callback();
    fetchPackagesRetried = true;
    isParanoidAboutWatchers = paranoid;
    doFetchPackages(callback);
}

function maybeRetryFetchModules(toShow, toLoad, callback) {
    if (fetchModulesRetried)
        return callback();
    fetchModulesRetried = true;
    doFetchModules(toShow, toLoad, callback);
}

handler.UNKNOWN_GUID = UNKNOWN_GUID;
handler.GUID_PREFIX = GUID_PREFIX;

});

