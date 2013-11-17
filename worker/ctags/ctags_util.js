/**
 * jsonalyzer CTAGs-based analyzer utility functions
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

var assert = require("plugins/c9.util/assert");

var MAX_DOCHEAD_LENGTH = 80;

module.exports.MAX_DOCHEAD_LENGTH = MAX_DOCHEAD_LENGTH;

module.exports.extractDocumentationAtRow = function(lines, row) {
    // # hash comments
    var line = lines[row];
    if (line && line.match(/^\s*#/)) {
        line = line.match(/^\s*#\s*(.*)/)[1];
        var results = [line];
        for (var start = row - 1; start >= 0; start--) {
            line = lines[start];
            if (!line.match(/^\s*#/))
                break;
            results.push(line.match(/^\s*#\s*(.*)/)[1]);
        }
        return filterDocumentation(results.join("\n"));
    }
    
    // /* c style comments */
    var end = null;
    for (; row >= 0; row--) {
        line = lines[row];
        for (var col = line.length - 2; col >= 0; col--) {
            if (!end) {
                if (line.substr(col, 2) === "*/") {
                    end = { sl: row, sc: col };
                    col--;
                } else if (!line[col].match(/[\s\/]/)) {
                    return;
                }
            } else if (line.substr(col, 2) === "/*") {
                var rows = ["", line.substr(col + 3)];
                for (var r = row + 1; r < end.sl; r++)
                    rows.push(lines[r]);
                rows.push(lines[end.sl].substr(0, end.sc));
                if (end.sl === row)
                    rows = ["", line.substring(col + 3, end.sc)];
                return filterDocumentation(rows.join("\n"));
            }
        }
    }
};

module.exports.findMatchingTags = function(lines, contents, tag, extractDocumentation, guessFargs, results) {
    assert(tag.regex.global, "Regex must use /g flag: " + tag.regex);
    var _self = this;
    
    contents.replace(tag.regex, function(fullMatch, name, offset) {
        assert(typeof offset === "number", "Regex must have one capture group: " + tag.regex);
        
        var row = getOffsetRow(contents,  offset);
        var line = lines[row];
        
        var doc, docHead;
        if (extractDocumentation) {
            docHead = line.length > MAX_DOCHEAD_LENGTH
                ? line.substr(MAX_DOCHEAD_LENGTH) + "..."
                : line;
            doc = _self.extractDocumentationAtRow(lines, row - 1);
        }
        
        results["_" + name] = results["_" + name] || [];
        
        if (tag.docOnly) { // HACK: tag that only contributes documentation
            if (!doc)
                return;
            if (results["_" + name][0]) {
                results["_" + name][0].doc = doc;
                return;
            }
        }
        
        results["_" + name].push({
            row: row,
            docHead: docHead,
            guessFargs: guessFargs,
            doc: doc,
            kind: tag.kind
        });
        return fullMatch;
    });
    
    return results;
};

module.exports.guessFargs = function(line, name) {
    var guess = /\([A-Za-z0-9$_,\s]*(\))?/;
    guess.lastIndex = line.indexOf(name) + name.length;
    var match = guess.exec(line);
    return match && match[0] + (match[1] ? "" : "...") || "";
};

function getOffsetRow(contents, offset) {
    var result = 0;
    var lastIndex = offset;
    for (;;) {
        lastIndex = lastIndex === 0
            ? -1
            : contents.lastIndexOf("\n", lastIndex - 1);
        if (lastIndex < 0)
            return result;
        result++;
    }
}

function filterDocumentation(doc) {
    return escapeHtml(doc)
        .replace(/\n\s*\*\s*|\n\s*/g, "\n")
        .replace(/\n\n(?!@)/g, "<br/><br/>")
        .replace(/\n@(\w+)/, "<br/>\n@$1") // separator between summary and rest
        .replace(/\n@param (\w+)/g, "<br/>\n<b>@param</b> <i>$1</i>")
        .replace(/\n@(\w+)/g, "<br/>\n<b>@$1</b>");
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

});