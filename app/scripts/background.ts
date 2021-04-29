import { browser, WebRequest } from "webextension-polyfill-ts";

type OnHeadersReceivedDetailsType = WebRequest.OnHeadersReceivedDetailsType;

let rules: [RegExp, [RegExp, string][]][] = []

function dropCommentsAndWhitespace(s: string) {
    var r = "";
    var lines = s.match(/[^\r\n]+/g) || [];
    lines.forEach(function (line) {
        if (line.match(/^\s*#/) !== null ||
            line.match(/^\s*$/) !== null) {
            return;
        }
        r += line + "\n";
    });
    return r;
}

function parseRules(config: string) {
    config = dropCommentsAndWhitespace(config);
    if (config === "") {
        return [];
    }
    try {
        return JSON.parse(config);
    } catch (_) {
        return null;
    }
}

type Rule = [
    regexp: string,
    patterns: string[]
]

function validateRules(rules: Rule[] | null) {
    if (!Array.isArray(rules)) {
        return null;
    }
    var fail = false;
    // @ts-ignore
    rules.forEach(function (rule) {
        if (rule.length !== 2 ||
            typeof rule[0] !== "string" ||
            !Array.isArray(rule[1])) {
            fail = true;
            return null;
        }
        // @ts-ignore
        rule[1].forEach(function (subrule) {
            if (subrule.length !== 2 ||
                typeof subrule[0] !== "string" ||
                typeof subrule[1] !== "string") {
                fail = true;
                return null;
            }
        });
        if (fail) {
            return null;
        }
    });
    if (fail) {
        return null;
    }
    return rules;
}

function regexpifyRules(newRules: Rule[] | null) {
    if (newRules === null) {
        return null;
    }
    return newRules.map(function (rule) {
        return [
            new RegExp(rule[0]),
            rule[1].map(function (subrule) {
                return [
                    new RegExp(subrule[0]),
                    subrule[1]
                ];
            })
        ];
    });
}

function processConfig(config?: string) {
    if (typeof config !== "string") {
        config = "";
    }
    return regexpifyRules(validateRules(parseRules(config)));
}

// @ts-ignore
async function messageHandler(request) {
    if (request.action === "RESTORE_CONFIG") {
        const items = await browser.storage.sync.get({ config: defaultConfig })
        const config = items.config ? items.config : defaultConfig;
        return config;
    } else if (request.action === "SAVE_CONFIG") {
        const config = request.config;
        const newRules = processConfig(config);
        if (newRules !== null) {
            await browser.storage.sync.set({ config: config });
            // @ts-ignore
            rules = newRules;
            return "SUCCESS";
        } else {
            return "FAILURE";
        }
    } else {
        console.error("Invalid request: ", request);
    }
}

function requestProcessor(details: OnHeadersReceivedDetailsType) {
    for (var i = 0, iLen = rules.length; i !== iLen; ++i) {
        if (!rules[i][0].test(details.url)) {
            continue;
        }
        var subrules = rules[i][1];
        var headers = details.responseHeaders || [];
        for (var j = 0, jLen = headers.length; j !== jLen; ++j) {
            var header = headers[j];
            var name = header.name.toLowerCase();
            if (name !== "content-security-policy" &&
                name !== "content-security-policy-report-only" &&
                name !== "x-webkit-csp") {
                continue;
            }
            for (var k = 0, kLen = subrules.length; k !== kLen; ++k) {
                header.value = header?.value?.replace(subrules[k][0],
                    subrules[k][1]);
            }
        }
        return { responseHeaders: headers };
    }
    return { responseHeaders: details.responseHeaders };
}

const defaultConfig =
    "# Rules need to be in JSON syntax:\n" +
    "#\n" +
    "# [\n" +
    '#     ["url-regexp", [\n' +
    '#         ["pattern-regexp", "replacement-string"],\n' +
    "#         ...\n" +
    "#     ]],\n" +
    "#     ...\n" +
    "# ]\n" +
    "#\n" +
    "# Keep in mind that JSON does not allow trailing commas.\n" +
    "# Lines starting with '#' are ignored.  Have fun!\n" +
    "\n" +
    "[\n" +
    "# Example: whitelisting MathJax on GitHub:\n" +
    '#    ["https://gist\\\\.github\\\\.com", [\n' +
    '#        ["script-src", "script-src https://cdn.mathjax.org"],\n' +
    '#        ["font-src", "font-src https://cdn.mathjax.org"]\n' +
    "#    ]]\n" +
    "]\n";

console.log("START");
browser.storage.sync.get({ config: "" }).then(function (items) {
    console.log("items", items);
    const newRules = processConfig(items.config);
    if (newRules !== null) {
        // @ts-ignore
        rules = newRules;
    }
    // @ts-ignore
    browser.runtime.onMessage.addListener(messageHandler);
    browser.webRequest.onHeadersReceived.addListener(requestProcessor, {
        urls: ["*://*/*"],
        types: ["main_frame", "sub_frame"]
    }, ["blocking", "responseHeaders"]);
});
