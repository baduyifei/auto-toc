// ==UserScript==
// @name         auto-toc
// @name:zh-CN   auto-toc
// @namespace    EX
// @version      1.08
// @license MIT
// @description Generate table of contents for any website. By default, it is not open. You need to go to the plug-in menu to open the switch for the website that wants to open the toc. The plug-in will remember this switch, and the toc will be generated automatically according to the switch when you open the website the next time.
// @description:zh-cn 可以为任何网站生成TOC网站目录大纲, 默认是不打开的, 需要去插件菜单里为想要打开 toc 的网站开启开关, 插件会记住这个开关, 下回再打开这个网站会自动根据开关来生成 toc 与否. 高级技巧: 单击TOC拖动栏可以自动折叠 TOC, 双击TOC拖动栏可以关闭 TOC .
// @include      http://*
// @include      https://*
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_addStyle
// @grant        GM.addStyle
// ==/UserScript==

(function () {
    "use strict";

    function getRootWindow() {
        let w = window;
        while (w !== w.parent) {
            w = w.parent;
        }
        return w;
    }

    function getMaster(root) {
        const iframes = [].slice.apply(
            root.document.getElementsByTagName("iframe")
        );

        if (iframes.length === 0) {
            return root;
        } else {
            const largestChild = iframes
                .map((f) => ({
                    elem: f,
                    area: f.offsetWidth * f.offsetHeight,
                }))
                .sort((a, b) => b.area - a.area)[0];
            const html = root.document.documentElement;
            return largestChild.area / (html.offsetWidth * html.offsetHeight) >
                0.5
                ? largestChild.elem.contentWindow
                : root;
        }
    }

    function isMasterFrame(w) {
        const root = getRootWindow();
        const master = getMaster(root);
        return w === master;
    }

    var toastCSS = `
        #smarttoc-toast {
            all: initial;
        }
        
        #smarttoc-toast * {
            all: unset;
        }
        
        #smarttoc-toast {
            display: none;
            position: fixed;
            left: 50%;
            transform: translateX(-50%);
            top: 0;
            margin: 1em 2em;
            min-width: 16em;
            text-align: center;
            padding: 1em;
            z-index: 10000;
            box-sizing: border-box;
            background-color: #017afe;
            border: 1px solid rgba(158, 158, 158, 0.22);
            color: #ffffff;
            font-size: calc(12px + 0.15vw);
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-weight: normal;
            -webkit-font-smoothing: subpixel-antialiased;
            font-smoothing: subpixel-antialiased;
            transition: opacity 200ms ease-out, transform 200ms ease-out;
            border-radius: 18px;
            box-shadow: 0px 0px 0px 0px rgb(0 0 0 / 20%), 0px 0px 8px 0 rgb(0 0 0 / 19%);
        }
        
        #smarttoc-toast.enter {
            display: block;
            opacity: 0.01;
            transform: translate3d(-50%, -2em, 0);
        }
        
        #smarttoc-toast.enter.enter-active {
            display: block;
            opacity: 1;
            transform: translate3d(-50%, 0, 0);
        }
        
        #smarttoc-toast.leave {
            display: block;
            opacity: 1;
            transform: translate3d(-50%, 0, 0);
        }
        
        #smarttoc-toast.leave.leave-active {
            display: block;
            opacity: 0.01;
            transform: translate3d(-50%, -2em, 0);
        }
    `;

    function log() {
        if (false) {
        }
    }

    function draw(elem, color = "red") {
        if (false && elem) {
        }
    }

    function assert(condition, error) {
        if (!condition) {
            throw new Error(error);
        }
    }

    // '12px' => 12
    const num = (size = "0") =>
        typeof size === "number" ? size : +size.replace(/px/, "");

    // '12px' <= 12
    const px = (size = 0) => num(size) + "px";

    function throttle(fn, delay) {
        if (delay) {
            let timer;
            return function timerThrottled(...args) {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    fn(...args);
                }, delay);
            };
        } else {
            let request;
            return function rafThrottled(...args) {
                cancelAnimationFrame(request);
                request = requestAnimationFrame(function () {
                    fn(...args);
                });
            };
        }
    }

    const safe = (str) => str.replace(/\s+/g, "-");

    const unique = (function uniqueGenerator() {
        let set = new Set();
        return function unique(str) {
            let id = 1;
            while (set.has(str)) {
                str = str.replace(/(\$\d+)?$/, "") + "$" + id;
                id++;
            }
            set.add(str);
            return str;
        };
    })();

    const getScroll = (elem, direction = "top") => {
        if (elem === document.body) {
            return direction === "top"
                ? document.documentElement.scrollTop || document.body.scrollTop
                : document.documentElement.scrollLeft ||
                      document.body.scrollLeft;
        } else {
            return direction === "top" ? elem.scrollTop : elem.scrollLeft;
        }
    };

    const setScroll = (elem, val, direction = "top") => {
        if (elem === document.body) {
            if (direction === "top") {
                document.documentElement.scrollTop = val;
                window.scrollTo(window.scrollX, val);
            } else {
                document.documentElement.scrollLeft = val;
                window.scrollTo(val, window.scrollY);
            }
        } else {
            if (direction === "top") {
                elem.scrollTop = val;
            } else {
                elem.scrollLeft = val;
            }
        }
    };

    const scrollTo = (function scrollToFactory() {
        let request;
        const easeOutQuad = function (t, b, c, d) {
            t /= d;
            return -c * t * (t - 2) + b;
        };
        return function scrollTo({
            targetElem,
            scrollElem,
            topMargin = 0,
            maxDuration = 300,
            easeFn,
            callback,
        }) {
            cancelAnimationFrame(request);
            let rect = targetElem.getBoundingClientRect();
            let endScrollTop =
                rect.top -
                (scrollElem === document.body
                    ? 0
                    : scrollElem.getBoundingClientRect().top) +
                getScroll(scrollElem) -
                topMargin;
            let startScrollTop = getScroll(scrollElem);
            let distance = endScrollTop - startScrollTop;
            let startTime;
            let ease = easeFn || easeOutQuad;
            let distanceRatio = Math.min(Math.abs(distance) / 10000, 1);
            let duration = Math.max(
                maxDuration * distanceRatio * (2 - distanceRatio),
                10
            );
            if (!maxDuration) {
                setScroll(scrollElem, endScrollTop);
                if (callback) {
                    callback();
                }
            } else {
                requestAnimationFrame(update);
            }

            function update(timestamp) {
                if (!startTime) {
                    startTime = timestamp;
                }
                let progress = (timestamp - startTime) / duration;
                if (progress < 1) {
                    setScroll(
                        scrollElem,
                        ease(
                            timestamp - startTime,
                            startScrollTop,
                            distance,
                            duration
                        )
                    );
                    requestAnimationFrame(update);
                } else {
                    setScroll(scrollElem, endScrollTop);
                    if (callback) {
                        callback();
                    }
                }
            }
        };
    })();

    function toDash(str) {
        return str.replace(/([A-Z])/g, (match, p1) => "-" + p1.toLowerCase());
    }

    function applyStyle(elem, style = {}, reset = false) {
        if (reset) {
            elem.style = "";
        }
        if (typeof style === "string") {
            elem.style = style;
        } else {
            for (let prop in style) {
                if (typeof style[prop] === "number") {
                    elem.style.setProperty(
                        toDash(prop),
                        px(style[prop]),
                        "important"
                    );
                } else {
                    elem.style.setProperty(
                        toDash(prop),
                        style[prop],
                        "important"
                    );
                }
            }
        }
    }

    function translate3d(x = 0, y = 0, z = 0) {
        return `translate3d(${Math.round(x)}px, ${Math.round(
            y
        )}px, ${Math.round(z)}px)`; // 0.5px => blurred text
    }

    function setClass(elem, names, delay) {
        if (delay === undefined) {
            elem.classList = names;
        } else {
            return setTimeout(() => {
                elem.classList = names;
            }, delay);
        }
    }

    const toast = (function toastFactory() {
        let timers = [];
        return function toast(msg, display_duration = 1600 /* ms */) {
            let toast;
            insertCSS(toastCSS, "smarttoc-toast__css");
            if (document.getElementById("smarttoc-toast")) {
                toast = document.getElementById("smarttoc-toast");
            } else {
                toast = document.createElement("DIV");
                toast.id = "smarttoc-toast";
                document.body.appendChild(toast);
            }
            toast.textContent = msg;

            timers.forEach(clearTimeout);
            toast.classList = "";

            const set = setClass.bind(null, toast);

            toast.classList = "enter";
            timers = [
                set("enter enter-active", 0),
                set("leave", display_duration),
                set("leave leave-active", display_duration),
                set("", display_duration + 200),
            ];
        };
    })();

    const insertCSS = function (css, id) {
        // if (!document.getElementById(id)) {
        let style = document.createElement("STYLE");
        style.type = "text/css";
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
        // return
        // }
    };

    function shouldCollapseToc() {
        const domain2isCollapse = GM_getValue(
            "menu_GAEEScript_auto_collapse_toc"
        );
        // console.log('[shouldCollapseToc cccccccccccccccccccccccccccccc]', domain2isCollapse);
        // alert(domain2isCollapse[window.location.host])
        return domain2isCollapse[window.location.host];
    }

    function getTocCss() {
        const shouldCollapse = shouldCollapseToc();
        console.log("[getTocCss]", shouldCollapse);
        return (
            `
            @media (prefers-color-scheme: dark) {
                #smarttoc.dark-scheme {
                    background-color: rgb(48, 52, 54);
                }
            
                #smarttoc.dark-scheme .handle {
                    color: #ffffff;
                }
            
                #smarttoc.dark-scheme a {
                    color: #ccc;
                }
            
                #smarttoc.dark-scheme a:hover,
                #smarttoc.dark-scheme a:active {
                    border-left-color: #f6f6f6;
                    color: #fff;
                }
            
                #smarttoc.dark-scheme li.active>a {
                    border-left-color: rgb(46, 82, 154);
                    color: rgb(131, 174, 218)
                }
            }
            
            #smarttoc {
                all: initial;
            }
            
            #smarttoc * {
                all: unset;
            }
            
            /* container */
            #smarttoc {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                position: fixed;
                max-width: 16em;
                min-width: 12em;
            ` +
            (shouldCollapse
                ? "max-height: 22px;"
                : "max-height: calc(100vh - 100px);") +
            `
                z-index: 10000;
                box-sizing: border-box;
                background-color: #fff;
                color: gray;
                font-size: calc(12px + 0.1vw);
                font-family: \"Helvetica Neue\", Helvetica, Arial, sans-serif;
                line-height: 1.5;
                font-weight: normal;
                border: 1px solid rgba(158, 158, 158, 0.22);
                -webkit-font-smoothing: subpixel-antialiased;
                font-smoothing: subpixel-antialiased;
                overflow: hidden;
                contain: content;
                box-shadow: 0px 0px 0px 0px rgb(0 0 0 / 20%), 0px 0px 8px 0 rgb(0 0 0 / 19%);
                border-radius: 6px;
                transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
            ` +
            (shouldCollapse ? "opacity: 0.6;" : "opacity: 1;") +
            `
            }
            
            #smarttoc:hover {
            ` +
            (shouldCollapse
                ? "max-height: calc(100vh - 100px); opacity: 1"
                : "") +
            `
            }
            
            #smarttoc.hidden {
                display: none;
            }
            
            #smarttoc .handle {
                -webkit-user-select: none;
                user-select: none;
                border-bottom: 1px solid rgba(158, 158, 158, 0.22);
                padding: 0.1em 0.7em;
                font-variant-caps: inherit;
                font-variant: small-caps;
                font-size: 0.9em;
                color: rgb(0, 0, 0);
                cursor: pointer;
                text-align: center;
                opacity: 1;
            }
            
            #smarttoc .handle:hover,
            #smarttoc .handle:active {
                cursor: move;
            }
            
            #smarttoc>ul {
                width: 15em;
                flex-grow: 1;
                padding: 0 1.3em 1.3em 1em;
                overflow-y: auto;
                overflow-x: hidden;
            }
            
            /* all headings  */
            #smarttoc ul,
            #smarttoc li {
                list-style: none;
                display: block;
            }
            
            #smarttoc a {
                text-decoration: none;
                color: gray;
                display: block;
                line-height: 1.3;
                padding-top: 0.2em;
                padding-bottom: 0.2em;
                text-overflow: ellipsis;
                overflow-x: hidden;
                white-space: nowrap;
                margin-bottom: 0.8px;
                margin-top: 0.8px;
            }
            
            #smarttoc a:hover,
            #smarttoc a:active {
                border-left-color: rgba(86, 61, 124, 0.5);
                color: #563d7c;
            }
            
            #smarttoc li.active>a {
                border-left-color: #563d7c;
                color: #563d7c;
            }
            
            /* heading level: 1 */
            #smarttoc ul {
                line-height: 2;
            }
            
            #smarttoc ul a {
                font-size: 1em;
                padding-left: 1.3em;
                cursor: pointer
            }
            
            #smarttoc ul a:hover,
            #smarttoc ul a:active,
            #smarttoc ul li.active>a {
                border-left-width: 3px;
                border-left-style: solid;
                padding-left: calc(1.3em - 3px);
            }
            
            #smarttoc ul li.active>a {
                font-weight: 700;
            }
            
            /* heading level: 2 (hidden only when there are too many headings)  */
            #smarttoc ul ul {
                line-height: 1.8;
            }
            
            #smarttoc.lengthy ul ul {
                display: none;
            }
            
            #smarttoc.lengthy ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul a {
                font-size: 1em;
                padding-left: 2.7em;
            }
            
            #smarttoc ul ul a:hover,
            #smarttoc ul ul a:active,
            #smarttoc ul ul li.active>a {
                border-left-width: 1.6px;
                border-left-style: solid;
                padding-left: calc(2.7em - 2px);
                font-weight: normal;
            }
            
            /* heading level: 3 (hidden unless parent is active) */
            #smarttoc ul ul ul {
                line-height: 1.7;
                display: none;
            }
            
            #smarttoc ul ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul ul a {
                font-size: 1em;
                padding-left: 4em;
            }
            
            #smarttoc ul ul ul a:hover,
            #smarttoc ul ul ul a:active,
            #smarttoc ul ul ul li.active>a {
                border-left-width: 0.8px;
                border-left-style: solid;
                padding-left: calc(4em - 1px);
                font-weight: normal;
            }
        `
        );
    }

    const proto = {
        subscribe(cb, emitOnSubscribe = true) {
            if (emitOnSubscribe && this.value !== undefined) {
                cb(this.value);
            }
            this.listeners.push(cb);
        },
        addDependent(dependent) {
            this.dependents.push(dependent);
        },
        update(val) {
            this.value = val;
            this.changed = true;
            this.dependents.forEach((dep) => dep.update(val));
        },
        flush() {
            if (this.changed) {
                this.changed = false;
                this.listeners.forEach((l) => l(this.value));
                this.dependents.forEach((dep) => dep.flush());
            }
        },
        unique() {
            let lastValue = this.value;
            let $unique = Stream(lastValue);
            this.subscribe((val) => {
                if (val !== lastValue) {
                    $unique(val);
                    lastValue = val;
                }
            });
            return $unique;
        },
        map(f) {
            return Stream.combine(this, f);
        },
        filter(f) {
            return this.map((output) => (f(output) ? output : undefined));
        },
        throttle(delay) {
            let $throttled = Stream(this.value);
            const emit = throttle($throttled, delay);
            this.subscribe(emit);
            return $throttled;
        },
        log(name) {
            this.subscribe((e) => console.log(`[${name}]: `, e));
            return this;
        },
    };

    function Stream(init) {
        let s = function (val) {
            if (val === undefined) return s.value;
            s.update(val);
            s.flush(val);
        };

        s.value = init;
        s.changed = false;
        s.listeners = [];
        s.dependents = [];

        return Object.assign(s, proto);
    }

    Stream.combine = function (...streams) {
        const combiner = streams.pop();
        let cached = streams.map((s) => s());
        const combined = Stream(combiner(...cached));

        streams.forEach((s, i) => {
            const dependent = {
                update(val) {
                    cached[i] = val;
                    combined.update(combiner(...cached));
                },
                flush() {
                    combined.flush();
                },
            };
            s.addDependent(dependent);
        });

        return combined;
    };

    Stream.interval = function (int) {
        let $interval = Stream();
        setInterval(() => $interval(null), int);
        return $interval;
    };

    Stream.fromEvent = function (elem, type) {
        let $event = Stream();
        elem.addEventListener(type, $event);
        return $event;
    };

    var commonjsGlobal =
        typeof window !== "undefined"
            ? window
            : typeof global !== "undefined"
            ? global
            : typeof self !== "undefined"
            ? self
            : {};

    function createCommonjsModule(fn, module) {
        return (
            (module = { exports: {} }),
            fn(module, module.exports),
            module.exports
        );
    }

    var mithril = createCommonjsModule(function (module) {
        (function () {
            "use strict";
            function Vnode(tag, key, attrs0, children, text, dom) {
                return {
                    tag: tag,
                    key: key,
                    attrs: attrs0,
                    children: children,
                    text: text,
                    dom: dom,
                    domSize: undefined,
                    state: undefined,
                    _state: undefined,
                    events: undefined,
                    instance: undefined,
                    skip: false,
                };
            }
            Vnode.normalize = function (node) {
                if (Array.isArray(node))
                    return Vnode(
                        "[",
                        undefined,
                        undefined,
                        Vnode.normalizeChildren(node),
                        undefined,
                        undefined
                    );
                if (node != null && typeof node !== "object")
                    return Vnode(
                        "#",
                        undefined,
                        undefined,
                        node === false ? "" : node,
                        undefined,
                        undefined
                    );
                return node;
            };
            Vnode.normalizeChildren = function normalizeChildren(children) {
                for (var i = 0; i < children.length; i++) {
                    children[i] = Vnode.normalize(children[i]);
                }
                return children;
            };
            var selectorParser =
                /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g;
            var selectorCache = {};
            var hasOwn = {}.hasOwnProperty;
            function compileSelector(selector) {
                var match,
                    tag = "div",
                    classes = [],
                    attrs = {};
                while ((match = selectorParser.exec(selector))) {
                    var type = match[1],
                        value = match[2];
                    if (type === "" && value !== "") tag = value;
                    else if (type === "#") attrs.id = value;
                    else if (type === ".") classes.push(value);
                    else if (match[3][0] === "[") {
                        var attrValue = match[6];
                        if (attrValue)
                            attrValue = attrValue
                                .replace(/\\(["'])/g, "$1")
                                .replace(/\\\\/g, "\\");
                        if (match[4] === "class") classes.push(attrValue);
                        else
                            attrs[match[4]] =
                                attrValue === ""
                                    ? attrValue
                                    : attrValue || true;
                    }
                }
                if (classes.length > 0) attrs.className = classes.join(" ");
                return (selectorCache[selector] = { tag: tag, attrs: attrs });
            }
            function execSelector(state, attrs, children) {
                var hasAttrs = false,
                    childList,
                    text;
                var className = attrs.className || attrs.class;
                for (var key in state.attrs) {
                    if (hasOwn.call(state.attrs, key)) {
                        attrs[key] = state.attrs[key];
                    }
                }
                if (className !== undefined) {
                    if (attrs.class !== undefined) {
                        attrs.class = undefined;
                        attrs.className = className;
                    }
                    if (state.attrs.className != null) {
                        attrs.className =
                            state.attrs.className + " " + className;
                    }
                }
                for (let key in attrs) {
                    if (hasOwn.call(attrs, key) && key !== "key") {
                        hasAttrs = true;
                        break;
                    }
                }
                if (
                    Array.isArray(children) &&
                    children.length === 1 &&
                    children[0] != null &&
                    children[0].tag === "#"
                ) {
                    text = children[0].children;
                } else {
                    childList = children;
                }
                return Vnode(
                    state.tag,
                    attrs.key,
                    hasAttrs ? attrs : undefined,
                    childList,
                    text
                );
            }
            function hyperscript(selector) {
                // Because sloppy mode sucks
                var attrs = arguments[1],
                    start = 2,
                    children;
                if (
                    selector == null ||
                    (typeof selector !== "string" &&
                        typeof selector !== "function" &&
                        typeof selector.view !== "function")
                ) {
                    throw Error(
                        "The selector must be either a string or a component."
                    );
                }
                if (typeof selector === "string") {
                    var cached =
                        selectorCache[selector] || compileSelector(selector);
                }
                if (attrs == null) {
                    attrs = {};
                } else if (
                    typeof attrs !== "object" ||
                    attrs.tag != null ||
                    Array.isArray(attrs)
                ) {
                    attrs = {};
                    start = 1;
                }
                if (arguments.length === start + 1) {
                    children = arguments[start];
                    if (!Array.isArray(children)) children = [children];
                } else {
                    children = [];
                    while (start < arguments.length)
                        children.push(arguments[start++]);
                }
                var normalized = Vnode.normalizeChildren(children);
                if (typeof selector === "string") {
                    return execSelector(cached, attrs, normalized);
                } else {
                    return Vnode(selector, attrs.key, attrs, normalized);
                }
            }
            hyperscript.trust = function (html) {
                if (html == null) html = "";
                return Vnode(
                    "<",
                    undefined,
                    undefined,
                    html,
                    undefined,
                    undefined
                );
            };
            hyperscript.fragment = function (attrs1, children) {
                return Vnode(
                    "[",
                    attrs1.key,
                    attrs1,
                    Vnode.normalizeChildren(children),
                    undefined,
                    undefined
                );
            };
            var m = hyperscript;
            /** @constructor */
            var PromisePolyfill = function (executor) {
                if (!(this instanceof PromisePolyfill))
                    throw new Error("Promise must be called with `new`");
                if (typeof executor !== "function")
                    throw new TypeError("executor must be a function");
                var self = this,
                    resolvers = [],
                    rejectors = [],
                    resolveCurrent = handler(resolvers, true),
                    rejectCurrent = handler(rejectors, false);
                var instance = (self._instance = {
                    resolvers: resolvers,
                    rejectors: rejectors,
                });
                var callAsync =
                    typeof setImmediate === "function"
                        ? setImmediate
                        : setTimeout;
                function handler(list, shouldAbsorb) {
                    return function execute(value) {
                        var then;
                        try {
                            if (
                                shouldAbsorb &&
                                value != null &&
                                (typeof value === "object" ||
                                    typeof value === "function") &&
                                typeof (then = value.then) === "function"
                            ) {
                                if (value === self)
                                    throw new TypeError(
                                        "Promise can't be resolved w/ itself"
                                    );
                                executeOnce(then.bind(value));
                            } else {
                                callAsync(function () {
                                    if (!shouldAbsorb && list.length === 0)
                                        console.error(
                                            "Possible unhandled promise rejection:",
                                            value
                                        );
                                    for (var i = 0; i < list.length; i++)
                                        list[i](value);
                                    (resolvers.length = 0),
                                        (rejectors.length = 0);
                                    instance.state = shouldAbsorb;
                                    instance.retry = function () {
                                        execute(value);
                                    };
                                });
                            }
                        } catch (e) {
                            rejectCurrent(e);
                        }
                    };
                }
                function executeOnce(then) {
                    var runs = 0;
                    function run(fn) {
                        return function (value) {
                            if (runs++ > 0) return;
                            fn(value);
                        };
                    }
                    var onerror = run(rejectCurrent);
                    try {
                        then(run(resolveCurrent), onerror);
                    } catch (e) {
                        onerror(e);
                    }
                }
                executeOnce(executor);
            };
            PromisePolyfill.prototype.then = function (
                onFulfilled,
                onRejection
            ) {
                var self = this,
                    instance = self._instance;
                function handle(callback, list, next, state) {
                    list.push(function (value) {
                        if (typeof callback !== "function") next(value);
                        else
                            try {
                                resolveNext(callback(value));
                            } catch (e) {
                                if (rejectNext) rejectNext(e);
                            }
                    });
                    if (
                        typeof instance.retry === "function" &&
                        state === instance.state
                    )
                        instance.retry();
                }
                var resolveNext, rejectNext;
                var promise = new PromisePolyfill(function (resolve, reject) {
                    (resolveNext = resolve), (rejectNext = reject);
                });
                handle(onFulfilled, instance.resolvers, resolveNext, true),
                    handle(onRejection, instance.rejectors, rejectNext, false);
                return promise;
            };
            PromisePolyfill.prototype.catch = function (onRejection) {
                return this.then(null, onRejection);
            };
            PromisePolyfill.resolve = function (value) {
                if (value instanceof PromisePolyfill) return value;
                return new PromisePolyfill(function (resolve) {
                    resolve(value);
                });
            };
            PromisePolyfill.reject = function (value) {
                return new PromisePolyfill(function (resolve, reject) {
                    reject(value);
                });
            };
            PromisePolyfill.all = function (list) {
                return new PromisePolyfill(function (resolve, reject) {
                    var total = list.length,
                        count = 0,
                        values = [];
                    if (list.length === 0) resolve([]);
                    else
                        for (var i = 0; i < list.length; i++) {
                            (function (i) {
                                function consume(value) {
                                    count++;
                                    values[i] = value;
                                    if (count === total) resolve(values);
                                }
                                if (
                                    list[i] != null &&
                                    (typeof list[i] === "object" ||
                                        typeof list[i] === "function") &&
                                    typeof list[i].then === "function"
                                ) {
                                    list[i].then(consume, reject);
                                } else consume(list[i]);
                            })(i);
                        }
                });
            };
            PromisePolyfill.race = function (list) {
                return new PromisePolyfill(function (resolve, reject) {
                    for (var i = 0; i < list.length; i++) {
                        list[i].then(resolve, reject);
                    }
                });
            };
            if (typeof window !== "undefined") {
                if (typeof window.Promise === "undefined")
                    window.Promise = PromisePolyfill;
                let PromisePolyfill = window.Promise;
            } else if (typeof commonjsGlobal !== "undefined") {
                if (typeof commonjsGlobal.Promise === "undefined")
                    commonjsGlobal.Promise = PromisePolyfill;
                let PromisePolyfill = commonjsGlobal.Promise;
            } else {
            }
            var buildQueryString = function (object) {
                if (
                    Object.prototype.toString.call(object) !== "[object Object]"
                )
                    return "";
                var args = [];
                for (var key0 in object) {
                    destructure(key0, object[key0]);
                }
                return args.join("&");
                function destructure(key0, value) {
                    if (Array.isArray(value)) {
                        for (var i = 0; i < value.length; i++) {
                            destructure(key0 + "[" + i + "]", value[i]);
                        }
                    } else if (
                        Object.prototype.toString.call(value) ===
                        "[object Object]"
                    ) {
                        for (let i in value) {
                            destructure(key0 + "[" + i + "]", value[i]);
                        }
                    } else
                        args.push(
                            encodeURIComponent(key0) +
                                (value != null && value !== ""
                                    ? "=" + encodeURIComponent(value)
                                    : "")
                        );
                }
            };
            var FILE_PROTOCOL_REGEX = new RegExp("^file://", "i");
            var _8 = function ($window, Promise) {
                var callbackCount = 0;
                var oncompletion;
                function setCompletionCallback(callback) {
                    oncompletion = callback;
                }
                function finalizer() {
                    var count = 0;
                    function complete() {
                        if (--count === 0 && typeof oncompletion === "function")
                            oncompletion();
                    }
                    return function finalize(promise0) {
                        var then0 = promise0.then;
                        promise0.then = function () {
                            count++;
                            var next = then0.apply(promise0, arguments);
                            next.then(complete, function (e) {
                                complete();
                                if (count === 0) throw e;
                            });
                            return finalize(next);
                        };
                        return promise0;
                    };
                }
                function normalize(args, extra) {
                    if (typeof args === "string") {
                        var url = args;
                        args = extra || {};
                        if (args.url == null) args.url = url;
                    }
                    return args;
                }
                function request(args, extra) {
                    var finalize = finalizer();
                    args = normalize(args, extra);
                    var promise0 = new Promise(function (resolve, reject) {
                        if (args.method == null) args.method = "GET";
                        args.method = args.method.toUpperCase();
                        var useBody =
                            args.method === "GET" || args.method === "TRACE"
                                ? false
                                : typeof args.useBody === "boolean"
                                ? args.useBody
                                : true;
                        if (typeof args.serialize !== "function")
                            args.serialize =
                                typeof FormData !== "undefined" &&
                                args.data instanceof FormData
                                    ? function (value) {
                                          return value;
                                      }
                                    : JSON.stringify;
                        if (typeof args.deserialize !== "function")
                            args.deserialize = deserialize;
                        if (typeof args.extract !== "function")
                            args.extract = extract;
                        args.url = interpolate(args.url, args.data);
                        if (useBody) args.data = args.serialize(args.data);
                        else args.url = assemble(args.url, args.data);
                        var xhr = new $window.XMLHttpRequest(),
                            aborted = false,
                            _abort = xhr.abort;
                        xhr.abort = function abort() {
                            aborted = true;
                            _abort.call(xhr);
                        };
                        xhr.open(
                            args.method,
                            args.url,
                            typeof args.async === "boolean" ? args.async : true,
                            typeof args.user === "string"
                                ? args.user
                                : undefined,
                            typeof args.password === "string"
                                ? args.password
                                : undefined
                        );
                        if (args.serialize === JSON.stringify && useBody) {
                            xhr.setRequestHeader(
                                "Content-Type",
                                "application/json; charset=utf-8"
                            );
                        }
                        if (args.deserialize === deserialize) {
                            xhr.setRequestHeader(
                                "Accept",
                                "application/json, text/*"
                            );
                        }
                        if (args.withCredentials)
                            xhr.withCredentials = args.withCredentials;
                        for (var key in args.headers)
                            if ({}.hasOwnProperty.call(args.headers, key)) {
                                xhr.setRequestHeader(key, args.headers[key]);
                            }
                        if (typeof args.config === "function")
                            xhr = args.config(xhr, args) || xhr;
                        xhr.onreadystatechange = function () {
                            // Don't throw errors on xhr.abort().
                            if (aborted) return;
                            if (xhr.readyState === 4) {
                                try {
                                    var response =
                                        args.extract !== extract
                                            ? args.extract(xhr, args)
                                            : args.deserialize(
                                                  args.extract(xhr, args)
                                              );
                                    if (
                                        (xhr.status >= 200 &&
                                            xhr.status < 300) ||
                                        xhr.status === 304 ||
                                        FILE_PROTOCOL_REGEX.test(args.url)
                                    ) {
                                        resolve(cast(args.type, response));
                                    } else {
                                        var error = new Error(xhr.responseText);
                                        for (var key in response)
                                            error[key] = response[key];
                                        reject(error);
                                    }
                                } catch (e) {
                                    reject(e);
                                }
                            }
                        };
                        if (useBody && args.data != null) xhr.send(args.data);
                        else xhr.send();
                    });
                    return args.background === true
                        ? promise0
                        : finalize(promise0);
                }
                function jsonp(args, extra) {
                    var finalize = finalizer();
                    args = normalize(args, extra);
                    var promise0 = new Promise(function (resolve, reject) {
                        var callbackName =
                            args.callbackName ||
                            "_mithril_" +
                                Math.round(Math.random() * 1e16) +
                                "_" +
                                callbackCount++;
                        var script = $window.document.createElement("script");
                        $window[callbackName] = function (data) {
                            script.parentNode.removeChild(script);
                            resolve(cast(args.type, data));
                            delete $window[callbackName];
                        };
                        script.onerror = function () {
                            script.parentNode.removeChild(script);
                            reject(new Error("JSONP request failed"));
                            delete $window[callbackName];
                        };
                        if (args.data == null) args.data = {};
                        args.url = interpolate(args.url, args.data);
                        args.data[args.callbackKey || "callback"] =
                            callbackName;
                        script.src = assemble(args.url, args.data);
                        $window.document.documentElement.appendChild(script);
                    });
                    return args.background === true
                        ? promise0
                        : finalize(promise0);
                }
                function interpolate(url, data) {
                    if (data == null) return url;
                    var tokens = url.match(/:[^\/]+/gi) || [];
                    for (var i = 0; i < tokens.length; i++) {
                        var key = tokens[i].slice(1);
                        if (data[key] != null) {
                            url = url.replace(tokens[i], data[key]);
                        }
                    }
                    return url;
                }
                function assemble(url, data) {
                    var querystring = buildQueryString(data);
                    if (querystring !== "") {
                        var prefix = url.indexOf("?") < 0 ? "?" : "&";
                        url += prefix + querystring;
                    }
                    return url;
                }
                function deserialize(data) {
                    try {
                        return data !== "" ? JSON.parse(data) : null;
                    } catch (e) {
                        throw new Error(data);
                    }
                }
                function extract(xhr) {
                    return xhr.responseText;
                }
                function cast(type0, data) {
                    if (typeof type0 === "function") {
                        if (Array.isArray(data)) {
                            for (var i = 0; i < data.length; i++) {
                                data[i] = new type0(data[i]);
                            }
                        } else return new type0(data);
                    }
                    return data;
                }
                return {
                    request: request,
                    jsonp: jsonp,
                    setCompletionCallback: setCompletionCallback,
                };
            };
            var requestService = _8(window, PromisePolyfill);
            var coreRenderer = function ($window) {
                var $doc = $window.document;
                var $emptyFragment = $doc.createDocumentFragment();
                var nameSpace = {
                    svg: "http://www.w3.org/2000/svg",
                    math: "http://www.w3.org/1998/Math/MathML",
                };
                var onevent;
                function setEventCallback(callback) {
                    return (onevent = callback);
                }
                function getNameSpace(vnode) {
                    return (
                        (vnode.attrs && vnode.attrs.xmlns) ||
                        nameSpace[vnode.tag]
                    );
                }
                //create
                function createNodes(
                    parent,
                    vnodes,
                    start,
                    end,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    for (var i = start; i < end; i++) {
                        var vnode = vnodes[i];
                        if (vnode != null) {
                            createNode(parent, vnode, hooks, ns, nextSibling);
                        }
                    }
                }
                function createNode(parent, vnode, hooks, ns, nextSibling) {
                    var tag = vnode.tag;
                    if (typeof tag === "string") {
                        vnode.state = {};
                        if (vnode.attrs != null)
                            initLifecycle(vnode.attrs, vnode, hooks);
                        switch (tag) {
                            case "#":
                                return createText(parent, vnode, nextSibling);
                            case "<":
                                return createHTML(parent, vnode, nextSibling);
                            case "[":
                                return createFragment(
                                    parent,
                                    vnode,
                                    hooks,
                                    ns,
                                    nextSibling
                                );
                            default:
                                return createElement(
                                    parent,
                                    vnode,
                                    hooks,
                                    ns,
                                    nextSibling
                                );
                        }
                    } else
                        return createComponent(
                            parent,
                            vnode,
                            hooks,
                            ns,
                            nextSibling
                        );
                }
                function createText(parent, vnode, nextSibling) {
                    vnode.dom = $doc.createTextNode(vnode.children);
                    insertNode(parent, vnode.dom, nextSibling);
                    return vnode.dom;
                }
                function createHTML(parent, vnode, nextSibling) {
                    var match1 = vnode.children.match(/^\s*?<(\w+)/im) || [];
                    var parent1 =
                        {
                            caption: "table",
                            thead: "table",
                            tbody: "table",
                            tfoot: "table",
                            tr: "tbody",
                            th: "tr",
                            td: "tr",
                            colgroup: "table",
                            col: "colgroup",
                        }[match1[1]] || "div";
                    var temp = $doc.createElement(parent1);
                    temp.innerHTML = vnode.children;
                    vnode.dom = temp.firstChild;
                    vnode.domSize = temp.childNodes.length;
                    var fragment = $doc.createDocumentFragment();
                    var child;
                    while ((child = temp.firstChild)) {
                        fragment.appendChild(child);
                    }
                    insertNode(parent, fragment, nextSibling);
                    return fragment;
                }
                function createFragment(parent, vnode, hooks, ns, nextSibling) {
                    var fragment = $doc.createDocumentFragment();
                    if (vnode.children != null) {
                        var children = vnode.children;
                        createNodes(
                            fragment,
                            children,
                            0,
                            children.length,
                            hooks,
                            null,
                            ns
                        );
                    }
                    vnode.dom = fragment.firstChild;
                    vnode.domSize = fragment.childNodes.length;
                    insertNode(parent, fragment, nextSibling);
                    return fragment;
                }
                function createElement(parent, vnode, hooks, ns, nextSibling) {
                    var tag = vnode.tag;
                    var attrs2 = vnode.attrs;
                    var is = attrs2 && attrs2.is;
                    ns = getNameSpace(vnode) || ns;
                    var element = ns
                        ? is
                            ? $doc.createElementNS(ns, tag, { is: is })
                            : $doc.createElementNS(ns, tag)
                        : is
                        ? $doc.createElement(tag, { is: is })
                        : $doc.createElement(tag);
                    vnode.dom = element;
                    if (attrs2 != null) {
                        setAttrs(vnode, attrs2, ns);
                    }
                    insertNode(parent, element, nextSibling);
                    if (
                        vnode.attrs != null &&
                        vnode.attrs.contenteditable != null
                    ) {
                        setContentEditable(vnode);
                    } else {
                        if (vnode.text != null) {
                            if (vnode.text !== "")
                                element.textContent = vnode.text;
                            else
                                vnode.children = [
                                    Vnode(
                                        "#",
                                        undefined,
                                        undefined,
                                        vnode.text,
                                        undefined,
                                        undefined
                                    ),
                                ];
                        }
                        if (vnode.children != null) {
                            var children = vnode.children;
                            createNodes(
                                element,
                                children,
                                0,
                                children.length,
                                hooks,
                                null,
                                ns
                            );
                            setLateAttrs(vnode);
                        }
                    }
                    return element;
                }
                function initComponent(vnode, hooks) {
                    var sentinel;
                    if (typeof vnode.tag.view === "function") {
                        vnode.state = Object.create(vnode.tag);
                        sentinel = vnode.state.view;
                        if (sentinel.$$reentrantLock$$ != null)
                            return $emptyFragment;
                        sentinel.$$reentrantLock$$ = true;
                    } else {
                        vnode.state = void 0;
                        sentinel = vnode.tag;
                        if (sentinel.$$reentrantLock$$ != null)
                            return $emptyFragment;
                        sentinel.$$reentrantLock$$ = true;
                        vnode.state =
                            vnode.tag.prototype != null &&
                            typeof vnode.tag.prototype.view === "function"
                                ? new vnode.tag(vnode)
                                : vnode.tag(vnode);
                    }
                    vnode._state = vnode.state;
                    if (vnode.attrs != null)
                        initLifecycle(vnode.attrs, vnode, hooks);
                    initLifecycle(vnode._state, vnode, hooks);
                    vnode.instance = Vnode.normalize(
                        vnode._state.view.call(vnode.state, vnode)
                    );
                    if (vnode.instance === vnode)
                        throw Error(
                            "A view cannot return the vnode it received as argument"
                        );
                    sentinel.$$reentrantLock$$ = null;
                }
                function createComponent(
                    parent,
                    vnode,
                    hooks,
                    ns,
                    nextSibling
                ) {
                    initComponent(vnode, hooks);
                    if (vnode.instance != null) {
                        var element = createNode(
                            parent,
                            vnode.instance,
                            hooks,
                            ns,
                            nextSibling
                        );
                        vnode.dom = vnode.instance.dom;
                        vnode.domSize =
                            vnode.dom != null ? vnode.instance.domSize : 0;
                        insertNode(parent, element, nextSibling);
                        return element;
                    } else {
                        vnode.domSize = 0;
                        return $emptyFragment;
                    }
                }
                //update
                function updateNodes(
                    parent,
                    old,
                    vnodes,
                    recycling,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    if (old === vnodes || (old == null && vnodes == null))
                        return;
                    else if (old == null)
                        createNodes(
                            parent,
                            vnodes,
                            0,
                            vnodes.length,
                            hooks,
                            nextSibling,
                            ns
                        );
                    else if (vnodes == null)
                        removeNodes(old, 0, old.length, vnodes);
                    else {
                        if (old.length === vnodes.length) {
                            var isUnkeyed = false;
                            for (var i = 0; i < vnodes.length; i++) {
                                if (vnodes[i] != null && old[i] != null) {
                                    isUnkeyed =
                                        vnodes[i].key == null &&
                                        old[i].key == null;
                                    break;
                                }
                            }
                            if (isUnkeyed) {
                                for (let i = 0; i < old.length; i++) {
                                    if (old[i] === vnodes[i]) continue;
                                    else if (
                                        old[i] == null &&
                                        vnodes[i] != null
                                    )
                                        createNode(
                                            parent,
                                            vnodes[i],
                                            hooks,
                                            ns,
                                            getNextSibling(
                                                old,
                                                i + 1,
                                                nextSibling
                                            )
                                        );
                                    else if (vnodes[i] == null)
                                        removeNodes(old, i, i + 1, vnodes);
                                    else
                                        updateNode(
                                            parent,
                                            old[i],
                                            vnodes[i],
                                            hooks,
                                            getNextSibling(
                                                old,
                                                i + 1,
                                                nextSibling
                                            ),
                                            recycling,
                                            ns
                                        );
                                }
                                return;
                            }
                        }
                        recycling = recycling || isRecyclable(old, vnodes);
                        if (recycling) {
                            var pool = old.pool;
                            old = old.concat(old.pool);
                        }
                        var oldStart = 0,
                            start = 0,
                            oldEnd = old.length - 1,
                            end = vnodes.length - 1,
                            map;
                        while (oldEnd >= oldStart && end >= start) {
                            var o = old[oldStart],
                                v = vnodes[start];
                            if (o === v && !recycling) oldStart++, start++;
                            else if (o == null) oldStart++;
                            else if (v == null) start++;
                            else if (o.key === v.key) {
                                var shouldRecycle =
                                    (pool != null &&
                                        oldStart >= old.length - pool.length) ||
                                    (pool == null && recycling);
                                oldStart++, start++;
                                updateNode(
                                    parent,
                                    o,
                                    v,
                                    hooks,
                                    getNextSibling(old, oldStart, nextSibling),
                                    shouldRecycle,
                                    ns
                                );
                                if (recycling && o.tag === v.tag)
                                    insertNode(
                                        parent,
                                        toFragment(o),
                                        nextSibling
                                    );
                            } else {
                                let o = old[oldEnd];
                                if (o === v && !recycling) oldEnd--, start++;
                                else if (o == null) oldEnd--;
                                else if (v == null) start++;
                                else if (o.key === v.key) {
                                    let shouldRecycle =
                                        (pool != null &&
                                            oldEnd >=
                                                old.length - pool.length) ||
                                        (pool == null && recycling);
                                    updateNode(
                                        parent,
                                        o,
                                        v,
                                        hooks,
                                        getNextSibling(
                                            old,
                                            oldEnd + 1,
                                            nextSibling
                                        ),
                                        shouldRecycle,
                                        ns
                                    );
                                    if (recycling || start < end)
                                        insertNode(
                                            parent,
                                            toFragment(o),
                                            getNextSibling(
                                                old,
                                                oldStart,
                                                nextSibling
                                            )
                                        );
                                    oldEnd--, start++;
                                } else break;
                            }
                        }
                        while (oldEnd >= oldStart && end >= start) {
                            let o = old[oldEnd],
                                v = vnodes[end];
                            if (o === v && !recycling) oldEnd--, end--;
                            else if (o == null) oldEnd--;
                            else if (v == null) end--;
                            else if (o.key === v.key) {
                                let shouldRecycle =
                                    (pool != null &&
                                        oldEnd >= old.length - pool.length) ||
                                    (pool == null && recycling);
                                updateNode(
                                    parent,
                                    o,
                                    v,
                                    hooks,
                                    getNextSibling(
                                        old,
                                        oldEnd + 1,
                                        nextSibling
                                    ),
                                    shouldRecycle,
                                    ns
                                );
                                if (recycling && o.tag === v.tag)
                                    insertNode(
                                        parent,
                                        toFragment(o),
                                        nextSibling
                                    );
                                if (o.dom != null) nextSibling = o.dom;
                                oldEnd--, end--;
                            } else {
                                if (!map) map = getKeyMap(old, oldEnd);
                                if (v != null) {
                                    var oldIndex = map[v.key];
                                    if (oldIndex != null) {
                                        let movable = old[oldIndex];
                                        let shouldRecycle =
                                            (pool != null &&
                                                oldIndex >=
                                                    old.length - pool.length) ||
                                            (pool == null && recycling);
                                        updateNode(
                                            parent,
                                            movable,
                                            v,
                                            hooks,
                                            getNextSibling(
                                                old,
                                                oldEnd + 1,
                                                nextSibling
                                            ),
                                            recycling,
                                            ns
                                        );
                                        insertNode(
                                            parent,
                                            toFragment(movable),
                                            nextSibling
                                        );
                                        old[oldIndex].skip = true;
                                        if (movable.dom != null)
                                            nextSibling = movable.dom;
                                    } else {
                                        var dom = createNode(
                                            parent,
                                            v,
                                            hooks,
                                            ns,
                                            nextSibling
                                        );
                                        nextSibling = dom;
                                    }
                                }
                                end--;
                            }
                            if (end < start) break;
                        }
                        createNodes(
                            parent,
                            vnodes,
                            start,
                            end + 1,
                            hooks,
                            nextSibling,
                            ns
                        );
                        removeNodes(old, oldStart, oldEnd + 1, vnodes);
                    }
                }
                function updateNode(
                    parent,
                    old,
                    vnode,
                    hooks,
                    nextSibling,
                    recycling,
                    ns
                ) {
                    var oldTag = old.tag,
                        tag = vnode.tag;
                    if (oldTag === tag) {
                        vnode.state = old.state;
                        vnode._state = old._state;
                        vnode.events = old.events;
                        if (!recycling && shouldNotUpdate(vnode, old)) return;
                        if (typeof oldTag === "string") {
                            if (vnode.attrs != null) {
                                if (recycling) {
                                    vnode.state = {};
                                    initLifecycle(vnode.attrs, vnode, hooks);
                                } else
                                    updateLifecycle(vnode.attrs, vnode, hooks);
                            }
                            switch (oldTag) {
                                case "#":
                                    updateText(old, vnode);
                                    break;
                                case "<":
                                    updateHTML(parent, old, vnode, nextSibling);
                                    break;
                                case "[":
                                    updateFragment(
                                        parent,
                                        old,
                                        vnode,
                                        recycling,
                                        hooks,
                                        nextSibling,
                                        ns
                                    );
                                    break;
                                default:
                                    updateElement(
                                        old,
                                        vnode,
                                        recycling,
                                        hooks,
                                        ns
                                    );
                            }
                        } else
                            updateComponent(
                                parent,
                                old,
                                vnode,
                                hooks,
                                nextSibling,
                                recycling,
                                ns
                            );
                    } else {
                        removeNode(old, null);
                        createNode(parent, vnode, hooks, ns, nextSibling);
                    }
                }
                function updateText(old, vnode) {
                    if (old.children.toString() !== vnode.children.toString()) {
                        old.dom.nodeValue = vnode.children;
                    }
                    vnode.dom = old.dom;
                }
                function updateHTML(parent, old, vnode, nextSibling) {
                    if (old.children !== vnode.children) {
                        toFragment(old);
                        createHTML(parent, vnode, nextSibling);
                    } else (vnode.dom = old.dom), (vnode.domSize = old.domSize);
                }
                function updateFragment(
                    parent,
                    old,
                    vnode,
                    recycling,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    updateNodes(
                        parent,
                        old.children,
                        vnode.children,
                        recycling,
                        hooks,
                        nextSibling,
                        ns
                    );
                    var domSize = 0,
                        children = vnode.children;
                    vnode.dom = null;
                    if (children != null) {
                        for (var i = 0; i < children.length; i++) {
                            var child = children[i];
                            if (child != null && child.dom != null) {
                                if (vnode.dom == null) vnode.dom = child.dom;
                                domSize += child.domSize || 1;
                            }
                        }
                        if (domSize !== 1) vnode.domSize = domSize;
                    }
                }
                function updateElement(old, vnode, recycling, hooks, ns) {
                    var element = (vnode.dom = old.dom);
                    ns = getNameSpace(vnode) || ns;
                    if (vnode.tag === "textarea") {
                        if (vnode.attrs == null) vnode.attrs = {};
                        if (vnode.text != null) {
                            vnode.attrs.value = vnode.text; //FIXME handle0 multiple children
                            vnode.text = undefined;
                        }
                    }
                    updateAttrs(vnode, old.attrs, vnode.attrs, ns);
                    if (
                        vnode.attrs != null &&
                        vnode.attrs.contenteditable != null
                    ) {
                        setContentEditable(vnode);
                    } else if (
                        old.text != null &&
                        vnode.text != null &&
                        vnode.text !== ""
                    ) {
                        if (old.text.toString() !== vnode.text.toString())
                            old.dom.firstChild.nodeValue = vnode.text;
                    } else {
                        if (old.text != null)
                            old.children = [
                                Vnode(
                                    "#",
                                    undefined,
                                    undefined,
                                    old.text,
                                    undefined,
                                    old.dom.firstChild
                                ),
                            ];
                        if (vnode.text != null)
                            vnode.children = [
                                Vnode(
                                    "#",
                                    undefined,
                                    undefined,
                                    vnode.text,
                                    undefined,
                                    undefined
                                ),
                            ];
                        updateNodes(
                            element,
                            old.children,
                            vnode.children,
                            recycling,
                            hooks,
                            null,
                            ns
                        );
                    }
                }
                function updateComponent(
                    parent,
                    old,
                    vnode,
                    hooks,
                    nextSibling,
                    recycling,
                    ns
                ) {
                    if (recycling) {
                        initComponent(vnode, hooks);
                    } else {
                        vnode.instance = Vnode.normalize(
                            vnode._state.view.call(vnode.state, vnode)
                        );
                        if (vnode.instance === vnode)
                            throw Error(
                                "A view cannot return the vnode it received as argument"
                            );
                        if (vnode.attrs != null)
                            updateLifecycle(vnode.attrs, vnode, hooks);
                        updateLifecycle(vnode._state, vnode, hooks);
                    }
                    if (vnode.instance != null) {
                        if (old.instance == null)
                            createNode(
                                parent,
                                vnode.instance,
                                hooks,
                                ns,
                                nextSibling
                            );
                        else
                            updateNode(
                                parent,
                                old.instance,
                                vnode.instance,
                                hooks,
                                nextSibling,
                                recycling,
                                ns
                            );
                        vnode.dom = vnode.instance.dom;
                        vnode.domSize = vnode.instance.domSize;
                    } else if (old.instance != null) {
                        removeNode(old.instance, null);
                        vnode.dom = undefined;
                        vnode.domSize = 0;
                    } else {
                        vnode.dom = old.dom;
                        vnode.domSize = old.domSize;
                    }
                }
                function isRecyclable(old, vnodes) {
                    if (
                        old.pool != null &&
                        Math.abs(old.pool.length - vnodes.length) <=
                            Math.abs(old.length - vnodes.length)
                    ) {
                        var oldChildrenLength =
                            (old[0] &&
                                old[0].children &&
                                old[0].children.length) ||
                            0;
                        var poolChildrenLength =
                            (old.pool[0] &&
                                old.pool[0].children &&
                                old.pool[0].children.length) ||
                            0;
                        var vnodesChildrenLength =
                            (vnodes[0] &&
                                vnodes[0].children &&
                                vnodes[0].children.length) ||
                            0;
                        if (
                            Math.abs(
                                poolChildrenLength - vnodesChildrenLength
                            ) <=
                            Math.abs(oldChildrenLength - vnodesChildrenLength)
                        ) {
                            return true;
                        }
                    }
                    return false;
                }
                function getKeyMap(vnodes, end) {
                    var map = {},
                        i = 0;
                    for (let i = 0; i < end; i++) {
                        let vnode = vnodes[i];
                        if (vnode != null) {
                            let key2 = vnode.key;
                            if (key2 != null) map[key2] = i;
                        }
                    }
                    return map;
                }
                function toFragment(vnode) {
                    var count0 = vnode.domSize;
                    if (count0 != null || vnode.dom == null) {
                        var fragment = $doc.createDocumentFragment();
                        if (count0 > 0) {
                            var dom = vnode.dom;
                            while (--count0)
                                fragment.appendChild(dom.nextSibling);
                            fragment.insertBefore(dom, fragment.firstChild);
                        }
                        return fragment;
                    } else return vnode.dom;
                }
                function getNextSibling(vnodes, i, nextSibling) {
                    for (; i < vnodes.length; i++) {
                        if (vnodes[i] != null && vnodes[i].dom != null)
                            return vnodes[i].dom;
                    }
                    return nextSibling;
                }
                function insertNode(parent, dom, nextSibling) {
                    if (nextSibling && nextSibling.parentNode)
                        parent.insertBefore(dom, nextSibling);
                    else parent.appendChild(dom);
                }
                function setContentEditable(vnode) {
                    var children = vnode.children;
                    if (
                        children != null &&
                        children.length === 1 &&
                        children[0].tag === "<"
                    ) {
                        var content = children[0].children;
                        if (vnode.dom.innerHTML !== content)
                            vnode.dom.innerHTML = content;
                    } else if (
                        vnode.text != null ||
                        (children != null && children.length !== 0)
                    )
                        throw new Error(
                            "Child node of a contenteditable must be trusted"
                        );
                }
                //remove
                function removeNodes(vnodes, start, end, context) {
                    for (var i = start; i < end; i++) {
                        var vnode = vnodes[i];
                        if (vnode != null) {
                            if (vnode.skip) vnode.skip = false;
                            else removeNode(vnode, context);
                        }
                    }
                }
                function removeNode(vnode, context) {
                    var expected = 1,
                        called = 0;
                    if (
                        vnode.attrs &&
                        typeof vnode.attrs.onbeforeremove === "function"
                    ) {
                        var result = vnode.attrs.onbeforeremove.call(
                            vnode.state,
                            vnode
                        );
                        if (
                            result != null &&
                            typeof result.then === "function"
                        ) {
                            expected++;
                            result.then(continuation, continuation);
                        }
                    }
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onbeforeremove === "function"
                    ) {
                        let result = vnode._state.onbeforeremove.call(
                            vnode.state,
                            vnode
                        );
                        if (
                            result != null &&
                            typeof result.then === "function"
                        ) {
                            expected++;
                            result.then(continuation, continuation);
                        }
                    }
                    continuation();
                    function continuation() {
                        if (++called === expected) {
                            onremove(vnode);
                            if (vnode.dom) {
                                var count0 = vnode.domSize || 1;
                                if (count0 > 1) {
                                    var dom = vnode.dom;
                                    while (--count0) {
                                        removeNodeFromDOM(dom.nextSibling);
                                    }
                                }
                                removeNodeFromDOM(vnode.dom);
                                if (
                                    context != null &&
                                    vnode.domSize == null &&
                                    !hasIntegrationMethods(vnode.attrs) &&
                                    typeof vnode.tag === "string"
                                ) {
                                    //TODO test custom elements
                                    if (!context.pool) context.pool = [vnode];
                                    else context.pool.push(vnode);
                                }
                            }
                        }
                    }
                }
                function removeNodeFromDOM(node) {
                    var parent = node.parentNode;
                    if (parent != null) parent.removeChild(node);
                }
                function onremove(vnode) {
                    if (
                        vnode.attrs &&
                        typeof vnode.attrs.onremove === "function"
                    )
                        vnode.attrs.onremove.call(vnode.state, vnode);
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onremove === "function"
                    )
                        vnode._state.onremove.call(vnode.state, vnode);
                    if (vnode.instance != null) onremove(vnode.instance);
                    else {
                        var children = vnode.children;
                        if (Array.isArray(children)) {
                            for (var i = 0; i < children.length; i++) {
                                var child = children[i];
                                if (child != null) onremove(child);
                            }
                        }
                    }
                }
                //attrs2
                function setAttrs(vnode, attrs2, ns) {
                    for (var key2 in attrs2) {
                        setAttr(vnode, key2, null, attrs2[key2], ns);
                    }
                }
                function setAttr(vnode, key2, old, value, ns) {
                    var element = vnode.dom;
                    if (
                        key2 === "key" ||
                        key2 === "is" ||
                        (old === value &&
                            !isFormAttribute(vnode, key2) &&
                            typeof value !== "object") ||
                        typeof value === "undefined" ||
                        isLifecycleMethod(key2)
                    )
                        return;
                    var nsLastIndex = key2.indexOf(":");
                    if (
                        nsLastIndex > -1 &&
                        key2.substr(0, nsLastIndex) === "xlink"
                    ) {
                        element.setAttributeNS(
                            "http://www.w3.org/1999/xlink",
                            key2.slice(nsLastIndex + 1),
                            value
                        );
                    } else if (
                        key2[0] === "o" &&
                        key2[1] === "n" &&
                        typeof value === "function"
                    )
                        updateEvent(vnode, key2, value);
                    else if (key2 === "style") updateStyle(element, old, value);
                    else if (
                        key2 in element &&
                        !isAttribute(key2) &&
                        ns === undefined &&
                        !isCustomElement(vnode)
                    ) {
                        if (key2 === "value") {
                            var normalized0 = "" + value; // eslint-disable-line no-implicit-coercion
                            //setting input[value] to same value by typing on focused element moves cursor to end in Chrome
                            if (
                                (vnode.tag === "input" ||
                                    vnode.tag === "textarea") &&
                                vnode.dom.value === normalized0 &&
                                vnode.dom === $doc.activeElement
                            )
                                return;
                            //setting select[value] to same value while having select open blinks select dropdown in Chrome
                            if (vnode.tag === "select") {
                                if (value === null) {
                                    if (
                                        vnode.dom.selectedIndex === -1 &&
                                        vnode.dom === $doc.activeElement
                                    )
                                        return;
                                } else {
                                    if (
                                        old !== null &&
                                        vnode.dom.value === normalized0 &&
                                        vnode.dom === $doc.activeElement
                                    )
                                        return;
                                }
                            }
                            //setting option[value] to same value while having select open blinks select dropdown in Chrome
                            if (
                                vnode.tag === "option" &&
                                old != null &&
                                vnode.dom.value === normalized0
                            )
                                return;
                        }
                        // If you assign an input type1 that is not supported by IE 11 with an assignment expression, an error0 will occur.
                        if (vnode.tag === "input" && key2 === "type") {
                            element.setAttribute(key2, value);
                            return;
                        }
                        element[key2] = value;
                    } else {
                        if (typeof value === "boolean") {
                            if (value) element.setAttribute(key2, "");
                            else element.removeAttribute(key2);
                        } else
                            element.setAttribute(
                                key2 === "className" ? "class" : key2,
                                value
                            );
                    }
                }
                function setLateAttrs(vnode) {
                    var attrs2 = vnode.attrs;
                    if (vnode.tag === "select" && attrs2 != null) {
                        if ("value" in attrs2)
                            setAttr(
                                vnode,
                                "value",
                                null,
                                attrs2.value,
                                undefined
                            );
                        if ("selectedIndex" in attrs2)
                            setAttr(
                                vnode,
                                "selectedIndex",
                                null,
                                attrs2.selectedIndex,
                                undefined
                            );
                    }
                }
                function updateAttrs(vnode, old, attrs2, ns) {
                    if (attrs2 != null) {
                        for (let key2 in attrs2) {
                            setAttr(
                                vnode,
                                key2,
                                old && old[key2],
                                attrs2[key2],
                                ns
                            );
                        }
                    }
                    if (old != null) {
                        for (var key2 in old) {
                            if (attrs2 == null || !(key2 in attrs2)) {
                                if (key2 === "className") key2 = "class";
                                if (
                                    key2[0] === "o" &&
                                    key2[1] === "n" &&
                                    !isLifecycleMethod(key2)
                                )
                                    updateEvent(vnode, key2, undefined);
                                else if (key2 !== "key")
                                    vnode.dom.removeAttribute(key2);
                            }
                        }
                    }
                }
                function isFormAttribute(vnode, attr) {
                    return (
                        attr === "value" ||
                        attr === "checked" ||
                        attr === "selectedIndex" ||
                        (attr === "selected" &&
                            vnode.dom === $doc.activeElement)
                    );
                }
                function isLifecycleMethod(attr) {
                    return (
                        attr === "oninit" ||
                        attr === "oncreate" ||
                        attr === "onupdate" ||
                        attr === "onremove" ||
                        attr === "onbeforeremove" ||
                        attr === "onbeforeupdate"
                    );
                }
                function isAttribute(attr) {
                    return (
                        attr === "href" ||
                        attr === "list" ||
                        attr === "form" ||
                        attr === "width" ||
                        attr === "height"
                    ); // || attr === "type"
                }
                function isCustomElement(vnode) {
                    return vnode.attrs.is || vnode.tag.indexOf("-") > -1;
                }
                function hasIntegrationMethods(source) {
                    return (
                        source != null &&
                        (source.oncreate ||
                            source.onupdate ||
                            source.onbeforeremove ||
                            source.onremove)
                    );
                }
                //style
                function updateStyle(element, old, style) {
                    if (old === style)
                        (element.style.cssText = ""), (old = null);
                    if (style == null) element.style.cssText = "";
                    else if (typeof style === "string")
                        element.style.cssText = style;
                    else {
                        if (typeof old === "string") element.style.cssText = "";
                        for (var key2 in style) {
                            element.style[key2] = style[key2];
                        }
                        if (old != null && typeof old !== "string") {
                            for (var key3 in old) {
                                if (!(key3 in style)) element.style[key3] = "";
                            }
                        }
                    }
                }
                //event
                function updateEvent(vnode, key2, value) {
                    var element = vnode.dom;
                    var callback =
                        typeof onevent !== "function"
                            ? value
                            : function (e) {
                                  var result = value.call(element, e);
                                  onevent.call(element, e);
                                  return result;
                              };
                    if (key2 in element)
                        element[key2] =
                            typeof value === "function" ? callback : null;
                    else {
                        var eventName = key2.slice(2);
                        if (vnode.events === undefined) vnode.events = {};
                        if (vnode.events[key2] === callback) return;
                        if (vnode.events[key2] != null)
                            element.removeEventListener(
                                eventName,
                                vnode.events[key2],
                                false
                            );
                        if (typeof value === "function") {
                            vnode.events[key2] = callback;
                            element.addEventListener(
                                eventName,
                                vnode.events[key2],
                                false
                            );
                        }
                    }
                }
                //lifecycle
                function initLifecycle(source, vnode, hooks) {
                    if (typeof source.oninit === "function")
                        source.oninit.call(vnode.state, vnode);
                    if (typeof source.oncreate === "function")
                        hooks.push(source.oncreate.bind(vnode.state, vnode));
                }
                function updateLifecycle(source, vnode, hooks) {
                    if (typeof source.onupdate === "function")
                        hooks.push(source.onupdate.bind(vnode.state, vnode));
                }
                function shouldNotUpdate(vnode, old) {
                    var forceVnodeUpdate, forceComponentUpdate;
                    if (
                        vnode.attrs != null &&
                        typeof vnode.attrs.onbeforeupdate === "function"
                    )
                        forceVnodeUpdate = vnode.attrs.onbeforeupdate.call(
                            vnode.state,
                            vnode,
                            old
                        );
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onbeforeupdate === "function"
                    )
                        forceComponentUpdate = vnode._state.onbeforeupdate.call(
                            vnode.state,
                            vnode,
                            old
                        );
                    if (
                        !(
                            forceVnodeUpdate === undefined &&
                            forceComponentUpdate === undefined
                        ) &&
                        !forceVnodeUpdate &&
                        !forceComponentUpdate
                    ) {
                        vnode.dom = old.dom;
                        vnode.domSize = old.domSize;
                        vnode.instance = old.instance;
                        return true;
                    }
                    return false;
                }
                function render(dom, vnodes) {
                    if (!dom)
                        throw new Error(
                            "Ensure the DOM element being passed to m.route/m.mount/m.render is not undefined."
                        );
                    var hooks = [];
                    var active = $doc.activeElement;
                    var namespace = dom.namespaceURI;
                    // First time0 rendering into a node clears it out
                    if (dom.vnodes == null) dom.textContent = "";
                    if (!Array.isArray(vnodes)) vnodes = [vnodes];
                    updateNodes(
                        dom,
                        dom.vnodes,
                        Vnode.normalizeChildren(vnodes),
                        false,
                        hooks,
                        null,
                        namespace === "http://www.w3.org/1999/xhtml"
                            ? undefined
                            : namespace
                    );
                    dom.vnodes = vnodes;
                    for (var i = 0; i < hooks.length; i++) hooks[i]();
                    if ($doc.activeElement !== active) active.focus();
                }
                return { render: render, setEventCallback: setEventCallback };
            };
            function throttle(callback) {
                //60fps translates to 16.6ms, round it down since setTimeout requires int
                var time = 16;
                var last = 0,
                    pending = null;
                var timeout =
                    typeof requestAnimationFrame === "function"
                        ? requestAnimationFrame
                        : setTimeout;
                return function () {
                    var now = Date.now();
                    if (last === 0 || now - last >= time) {
                        last = now;
                        callback();
                    } else if (pending === null) {
                        pending = timeout(function () {
                            pending = null;
                            callback();
                            last = Date.now();
                        }, time - (now - last));
                    }
                };
            }
            var _11 = function ($window) {
                var renderService = coreRenderer($window);
                renderService.setEventCallback(function (e) {
                    if (e.redraw === false) e.redraw = undefined;
                    else redraw();
                });
                var callbacks = [];
                function subscribe(key1, callback) {
                    unsubscribe(key1);
                    callbacks.push(key1, throttle(callback));
                }
                function unsubscribe(key1) {
                    var index = callbacks.indexOf(key1);
                    if (index > -1) callbacks.splice(index, 2);
                }
                function redraw() {
                    for (var i = 1; i < callbacks.length; i += 2) {
                        callbacks[i]();
                    }
                }
                return {
                    subscribe: subscribe,
                    unsubscribe: unsubscribe,
                    redraw: redraw,
                    render: renderService.render,
                };
            };
            var redrawService = _11(window);
            requestService.setCompletionCallback(redrawService.redraw);
            var _16 = function (redrawService0) {
                return function (root, component) {
                    if (component === null) {
                        redrawService0.render(root, []);
                        redrawService0.unsubscribe(root);
                        return;
                    }

                    if (
                        component.view == null &&
                        typeof component !== "function"
                    )
                        throw new Error(
                            "m.mount(element, component) expects a component, not a vnode"
                        );

                    var run0 = function () {
                        redrawService0.render(root, Vnode(component));
                    };
                    redrawService0.subscribe(root, run0);
                    redrawService0.redraw();
                };
            };
            m.mount = _16(redrawService);
            var Promise = PromisePolyfill;
            var parseQueryString = function (string) {
                if (string === "" || string == null) return {};
                if (string.charAt(0) === "?") string = string.slice(1);
                var entries = string.split("&"),
                    data0 = {},
                    counters = {};
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i].split("=");
                    var key5 = decodeURIComponent(entry[0]);
                    var value =
                        entry.length === 2 ? decodeURIComponent(entry[1]) : "";
                    if (value === "true") value = true;
                    else if (value === "false") value = false;
                    var levels = key5.split(/\]\[?|\[/);
                    var cursor = data0;
                    if (key5.indexOf("[") > -1) levels.pop();
                    for (var j = 0; j < levels.length; j++) {
                        var level = levels[j],
                            nextLevel = levels[j + 1];
                        var isNumber =
                            nextLevel == "" || !isNaN(parseInt(nextLevel, 10));
                        var isValue = j === levels.length - 1;
                        if (level === "") {
                            var key6 = levels.slice(0, j).join();
                            if (counters[key6] == null) counters[key6] = 0;
                            level = counters[key6]++;
                        }
                        if (cursor[level] == null) {
                            cursor[level] = isValue
                                ? value
                                : isNumber
                                ? []
                                : {};
                        }
                        cursor = cursor[level];
                    }
                }
                return data0;
            };
            var coreRouter = function ($window) {
                var supportsPushState =
                    typeof $window.history.pushState === "function";
                var callAsync0 =
                    typeof setImmediate === "function"
                        ? setImmediate
                        : setTimeout;
                function normalize1(fragment0) {
                    var data = $window.location[fragment0].replace(
                        /(?:%[a-f89][a-f0-9])+/gim,
                        decodeURIComponent
                    );
                    if (fragment0 === "pathname" && data[0] !== "/")
                        data = "/" + data;
                    return data;
                }
                var asyncId;
                function debounceAsync(callback0) {
                    return function () {
                        if (asyncId != null) return;
                        asyncId = callAsync0(function () {
                            asyncId = null;
                            callback0();
                        });
                    };
                }
                function parsePath(path, queryData, hashData) {
                    var queryIndex = path.indexOf("?");
                    var hashIndex = path.indexOf("#");
                    var pathEnd =
                        queryIndex > -1
                            ? queryIndex
                            : hashIndex > -1
                            ? hashIndex
                            : path.length;
                    if (queryIndex > -1) {
                        var queryEnd = hashIndex > -1 ? hashIndex : path.length;
                        var queryParams = parseQueryString(
                            path.slice(queryIndex + 1, queryEnd)
                        );
                        for (var key4 in queryParams)
                            queryData[key4] = queryParams[key4];
                    }
                    if (hashIndex > -1) {
                        var hashParams = parseQueryString(
                            path.slice(hashIndex + 1)
                        );
                        for (var key5 in hashParams)
                            hashData[key5] = hashParams[key5];
                    }
                    return path.slice(0, pathEnd);
                }
                var router = { prefix: "#!" };
                router.getPath = function () {
                    var type2 = router.prefix.charAt(0);
                    switch (type2) {
                        case "#":
                            return normalize1("hash").slice(
                                router.prefix.length
                            );
                        case "?":
                            return (
                                normalize1("search").slice(
                                    router.prefix.length
                                ) + normalize1("hash")
                            );
                        default:
                            return (
                                normalize1("pathname").slice(
                                    router.prefix.length
                                ) +
                                normalize1("search") +
                                normalize1("hash")
                            );
                    }
                };
                router.setPath = function (path, data, options) {
                    var queryData = {},
                        hashData = {};
                    path = parsePath(path, queryData, hashData);
                    if (data != null) {
                        for (var key4 in data) queryData[key4] = data[key4];
                        path = path.replace(
                            /:([^\/]+)/g,
                            function (match2, token) {
                                delete queryData[token];
                                return data[token];
                            }
                        );
                    }
                    var query = buildQueryString(queryData);
                    if (query) path += "?" + query;
                    var hash = buildQueryString(hashData);
                    if (hash) path += "#" + hash;
                    if (supportsPushState) {
                        var state = options ? options.state : null;
                        var title = options ? options.title : null;
                        $window.onpopstate();
                        if (options && options.replace)
                            $window.history.replaceState(
                                state,
                                title,
                                router.prefix + path
                            );
                        else
                            $window.history.pushState(
                                state,
                                title,
                                router.prefix + path
                            );
                    } else $window.location.href = router.prefix + path;
                };
                router.defineRoutes = function (routes, resolve, reject) {
                    function resolveRoute() {
                        var path = router.getPath();
                        var params = {};
                        var pathname = parsePath(path, params, params);
                        var state = $window.history.state;
                        if (state != null) {
                            for (var k in state) params[k] = state[k];
                        }
                        for (var route0 in routes) {
                            var matcher = new RegExp(
                                "^" +
                                    route0
                                        .replace(/:[^\/]+?\.{3}/g, "(.*?)")
                                        .replace(/:[^\/]+/g, "([^\\/]+)") +
                                    "/?$"
                            );
                            if (matcher.test(pathname)) {
                                pathname.replace(matcher, function () {
                                    var keys = route0.match(/:[^\/]+/g) || [];
                                    var values = [].slice.call(
                                        arguments,
                                        1,
                                        -2
                                    );
                                    for (var i = 0; i < keys.length; i++) {
                                        params[keys[i].replace(/:|\./g, "")] =
                                            decodeURIComponent(values[i]);
                                    }
                                    resolve(
                                        routes[route0],
                                        params,
                                        path,
                                        route0
                                    );
                                });
                                return;
                            }
                        }
                        reject(path, params);
                    }
                    if (supportsPushState)
                        $window.onpopstate = debounceAsync(resolveRoute);
                    else if (router.prefix.charAt(0) === "#")
                        $window.onhashchange = resolveRoute;
                    resolveRoute();
                };
                return router;
            };
            var _20 = function ($window, redrawService0) {
                var routeService = coreRouter($window);
                var identity = function (v) {
                    return v;
                };
                var render1, component, attrs3, currentPath, lastUpdate;
                var route = function (root, defaultRoute, routes) {
                    if (root == null)
                        throw new Error(
                            "Ensure the DOM element that was passed to `m.route` is not undefined"
                        );
                    var run1 = function () {
                        if (render1 != null)
                            redrawService0.render(
                                root,
                                render1(Vnode(component, attrs3.key, attrs3))
                            );
                    };
                    var bail = function (path) {
                        if (path !== defaultRoute)
                            routeService.setPath(defaultRoute, null, {
                                replace: true,
                            });
                        else
                            throw new Error(
                                "Could not resolve default route " +
                                    defaultRoute
                            );
                    };
                    routeService.defineRoutes(
                        routes,
                        function (payload, params, path) {
                            var update = (lastUpdate = function (
                                routeResolver,
                                comp
                            ) {
                                if (update !== lastUpdate) return;
                                component =
                                    comp != null &&
                                    (typeof comp.view === "function" ||
                                        typeof comp === "function")
                                        ? comp
                                        : "div";
                                (attrs3 = params),
                                    (currentPath = path),
                                    (lastUpdate = null);
                                render1 = (
                                    routeResolver.render || identity
                                ).bind(routeResolver);
                                run1();
                            });
                            if (payload.view || typeof payload === "function")
                                update({}, payload);
                            else {
                                if (payload.onmatch) {
                                    Promise.resolve(
                                        payload.onmatch(params, path)
                                    ).then(function (resolved) {
                                        update(payload, resolved);
                                    }, bail);
                                } else update(payload, "div");
                            }
                        },
                        bail
                    );
                    redrawService0.subscribe(root, run1);
                };
                route.set = function (path, data, options) {
                    if (lastUpdate != null) {
                        options = options || {};
                        options.replace = true;
                    }
                    lastUpdate = null;
                    routeService.setPath(path, data, options);
                };
                route.get = function () {
                    return currentPath;
                };
                route.prefix = function (prefix0) {
                    routeService.prefix = prefix0;
                };
                route.link = function (vnode1) {
                    vnode1.dom.setAttribute(
                        "href",
                        routeService.prefix + vnode1.attrs.href
                    );
                    vnode1.dom.onclick = function (e) {
                        if (
                            e.ctrlKey ||
                            e.metaKey ||
                            e.shiftKey ||
                            e.which === 2
                        )
                            return;
                        e.preventDefault();
                        e.redraw = false;
                        var href = this.getAttribute("href");
                        if (href.indexOf(routeService.prefix) === 0)
                            href = href.slice(routeService.prefix.length);
                        route.set(href, undefined, undefined);
                    };
                };
                route.param = function (key3) {
                    if (
                        typeof attrs3 !== "undefined" &&
                        typeof key3 !== "undefined"
                    )
                        return attrs3[key3];
                    return attrs3;
                };
                return route;
            };
            m.route = _20(window, redrawService);
            m.withAttr = function (attrName, callback1, context) {
                return function (e) {
                    callback1.call(
                        context || this,
                        attrName in e.currentTarget
                            ? e.currentTarget[attrName]
                            : e.currentTarget.getAttribute(attrName)
                    );
                };
            };
            var _28 = coreRenderer(window);
            m.render = _28.render;
            m.redraw = redrawService.redraw;
            m.request = requestService.request;
            m.jsonp = requestService.jsonp;
            m.parseQueryString = parseQueryString;
            m.buildQueryString = buildQueryString;
            m.version = "1.1.3";
            m.vnode = Vnode;
            if ("object" !== "undefined") module["exports"] = m;
            else {
            }
        })();
    });

    const restrictScroll = function (e) {
        const toc = e.currentTarget;
        const maxScroll = toc.scrollHeight - toc.offsetHeight;
        if (toc.scrollTop + e.deltaY < 0) {
            toc.scrollTop = 0;
            e.preventDefault();
        } else if (toc.scrollTop + e.deltaY > maxScroll) {
            toc.scrollTop = maxScroll;
            e.preventDefault();
        }
        e.redraw = false;
    };

    const TOC = function ({ $headings, $activeHeading, onClickHeading }) {
        // $activeHeading.subscribe(activeIndex => {})
        const toTree = function (headings) {
            let i = 0;
            let tree = { level: 0, children: [] };
            let stack = [tree];
            const top = (arr) => arr.slice(-1)[0];

            while (i < headings.length) {
                let { level, isActive } = headings[i];
                if (level === stack.length) {
                    const node = {
                        heading: headings[i],
                        children: [],
                    };
                    top(stack).children.push(node);
                    stack.push(node);
                    if (isActive) {
                        stack.forEach((node) => {
                            if (node.heading) {
                                node.heading.isActive = true;
                            }
                        });
                    }
                    i++;
                } else if (level < stack.length) {
                    stack.pop();
                } else if (level > stack.length) {
                    const node = {
                        heading: null,
                        children: [],
                    };
                    top(stack).children.push(node);
                    stack.push(node);
                }
            }
            return tree;
        };

        const UL = (children, { isRoot = false } = {}) =>
            mithril(
                "ul",
                {
                    onwheel: isRoot && restrictScroll,
                    onclick: isRoot && onClickHeading,
                },
                children.map(LI)
            );

        const LI = ({ heading, children }, index) =>
            mithril(
                "li",
                {
                    class: heading && heading.isActive ? "active" : "",
                    key: index,
                },
                [
                    heading &&
                        mithril(
                            "a",
                            {
                                href: `#${heading.anchor}`,
                                title: heading.node.textContent,
                            },
                            heading.node.textContent
                        ),
                    children && children.length && UL(children),
                ].filter(Boolean)
            );

        return {
            oncreate({ dom }) {
                // scroll to heading if out of view
                $activeHeading.subscribe((index) => {
                    const target = [].slice
                        .apply(dom.querySelectorAll(".active"))
                        .pop();
                    if (target) {
                        const targetRect = target.getBoundingClientRect();
                        const containerRect = dom.getBoundingClientRect();
                        const outOfView =
                            targetRect.top > containerRect.bottom ||
                            targetRect.bottom < containerRect.top;
                        if (outOfView) {
                            scrollTo({
                                targetElem: target,
                                scrollElem: dom,
                                maxDuration: 0,
                                topMargin:
                                    dom.offsetHeight / 2 -
                                    target.offsetHeight / 2,
                            });
                        }
                    }
                });
                Stream.combine($headings, $activeHeading, () => null).subscribe(
                    (_) => mithril.redraw()
                );
            },
            view() {
                $headings().forEach(
                    (h, i) => (h.isActive = i === $activeHeading())
                );
                const tree = toTree($headings());
                // console.log("tree begin aaa")
                // console.log(tree)
                // console.log("tree end bbb")
                return UL(tree.children, { isRoot: true });
            },
        };
    };

    const stop = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };

    let multi_click_cnt = 0;
    let last_click_ts = 0;

    const Handle = function ({ $userOffset }) {
        let [sClientX, sClientY] = [0, 0];
        let [sOffsetX, sOffsetY] = [0, 0];

        const onDrag = throttle((e) => {
            stop(e);
            let [dX, dY] = [e.clientX - sClientX, e.clientY - sClientY];
            $userOffset([sOffsetX + dX, sOffsetY + dY]);
            e.redraw = false;
        });

        const onDragEnd = (e) => {
            window.removeEventListener("mousemove", onDrag);
            window.removeEventListener("mouseup", onDragEnd);
            e.redraw = false;

            var domain2offset = GM_getValue(
                "menu_GAEEScript_auto_toc_domain_2_offset"
            );
            // 判断之前toc 的位置和现在的, 如果相等的话, 说明只是原地点击
            if (
                sOffsetX === $userOffset()[0] &&
                sOffsetY === $userOffset()[1]
            ) {
                console.log(
                    "[auto-toc, 原地点击, multi_click_cnt:]",
                    multi_click_cnt
                );
                if (Date.now() - last_click_ts < 233) {
                    // 说明是双击, 走关闭 toc 逻辑
                    console.log("[auto-toc, double click handle section]");
                    menuSwitch("menu_GAEEScript_auto_open_toc");
                    handleToc();
                    return
                }
                // 单击逻辑, 走折叠 toc 逻辑
                console.log("[auto-toc, click handle section]");
                menuSwitch("menu_GAEEScript_auto_collapse_toc");
                handleToc();
                last_click_ts = Date.now();

                ////////////////////////////////////////// 以下这种实现方案导致单击有延迟, 故不采用
                // if (multi_click_cnt > 0) {
                //     // setInterval 已经启动, 所以我们记录单击次数
                //     multi_click_cnt += 1;
                //     return;
                // }
                // multi_click_cnt = 1;
                // setTimeout(() => {
                //     if (multi_click_cnt === 1) {
                //         // 单击逻辑, 走折叠 toc 逻辑
                //         console.log("[auto-toc, click handle section]");
                //         menuSwitch("menu_GAEEScript_auto_collapse_toc");
                //     } else if (multi_click_cnt === 2) {
                //         // 说明是双击, 走关闭 toc 逻辑
                //         console.log("[auto-toc, double click handle section]");
                //         menuSwitch("menu_GAEEScript_auto_open_toc");
                //     }
                //     handleToc();
                //     multi_click_cnt = 0;
                // }, 222);
                return;
            }
            domain2offset[window.location.host] = $userOffset();
            GM_setValue(
                "menu_GAEEScript_auto_toc_domain_2_offset",
                domain2offset
            );
            console.log(
                "[auto-toc, update domain offset]",
                domain2offset[window.location.host]
            );
            console.log("[auto-toc, $userOffset()]", $userOffset());
            console.log(
                "[auto-toc, update domain offset, domain2offset]",
                domain2offset
            );
        };

        const onDragStart = (e) => {
            if (e.button === 0) {
                stop(e);
                sClientX = e.clientX;
                sClientY = e.clientY;
                sOffsetX = $userOffset()[0];
                sOffsetY = $userOffset()[1];
                window.addEventListener("mousemove", onDrag);
                window.addEventListener("mouseup", onDragEnd);
            }
            e.redraw = false;
        };

        const onDoubleClick = (e) => {
            console.log("[auto-toc, onDoubleClick]");
            menuSwitch("menu_GAEEScript_auto_open_toc");
            handleToc();
        };

        return {
            view() {
                return mithril(
                    ".handle",
                    {
                        onmousedown: onDragStart,
                        // ondblclick: onDoubleClick,
                    },
                    "○ ○ ○"
                );
            },
        };
    };

    const ARTICLE_TOC_GAP = 150;
    const TOP_MARGIN = 88;

    const makeSticky = function (options) {
        let {
            ref,
            scrollable,
            popper,
            direction,
            gap,
            $refChange,
            $scroll,
            $offset,
            $topMargin,
        } = options;

        let $refRect = Stream.combine($refChange, () => {
            let refRect = ref.getBoundingClientRect();
            let refStyle = window.getComputedStyle(ref);
            let scrollTop = getScroll(scrollable, "top");
            let scrollLeft = getScroll(scrollable, "left");
            let refFullRect = {
                top: refRect.top - scrollTop,
                right: refRect.right - scrollLeft,
                bottom: refRect.bottom - scrollTop,
                left: refRect.left - scrollLeft,
                width: refRect.width,
                height: refRect.height,
            };
            if (refStyle["box-sizing"] === "border-box") {
                refFullRect.left += num(refStyle["padding-left"]);
                refFullRect.right -= num(refStyle["padding-right"]);
                refFullRect.width -=
                    num(refStyle["padding-left"]) +
                    num(refStyle["padding-right"]);
            }
            return refFullRect;
        });
        let popperMetric = popper.getBoundingClientRect();
        const scrollableTop =
            scrollable === document.body
                ? 0
                : scrollable.getBoundingClientRect().top;
        return Stream.combine(
            $refRect,
            $scroll,
            $offset,
            $topMargin,
            (ref, [scrollX, scrollY], [offsetX, offsetY], topMargin) => {
                // console.log("[makeSticky, direction]", direction)
                // let x =
                //     direction === 'right'
                //         ? ref.right + gap
                //         : ref.left - gap - popperMetric.width
                // let y = Math.max(scrollableTop + topMargin, ref.top - scrollY)
                // let y = Math.max(scrollableTop + topMargin, 288 - scrollY)

                // 我们假定 topMargin 为 TOP_MARGIN (88), 方便固定 toc 在网页的位置
                let y = scrollableTop + TOP_MARGIN;
                let final_y = y + offsetY;
                // let y = Math.max((scrollableTop + TOP_MARGIN), 888 - scrollY)
                // let final_y = Math.max(TOP_MARGIN, offsetY + Math.max((scrollableTop + TOP_MARGIN), 288 - scrollY))
                // let final_y = Math.max(TOP_MARGIN, offsetY + Math.max((scrollableTop + TOP_MARGIN), 288 - scrollY))

                // 把 window.innerWidth 换成 window.outerWidth: 解决 safari 双指缩放导致 toc 居中遮挡网页内容的问题
                // popperMetric.width 是 toc 挂件的宽度
                // x = Math.min(Math.max(0, x), window.outerWidth - popperMetric.width) // restrict to visible area

                // 我们假定 popperMetric.width 为 288, 方便固定 toc 在网页的位置
                let final_x = offsetX + Math.max(0, window.outerWidth - 288); // restrict to visible area

                // console.log('[auto-toc, makeSticky, final_y]', Math.max((scrollableTop + TOP_MARGIN), 888 - scrollY), final_y)
                // console.log('[auto-toc, makeSticky, scrollableTop, topMargin]',scrollableTop, topMargin)
                // console.log('[auto-toc, makeSticky, window.outerWidth, popperMetric.width]',window.outerWidth, popperMetric.width)
                // console.log('[auto-toc, makeSticky, ref.right, gap]',ref.right, gap)
                // console.log('[auto-toc, makeSticky, x, window.outerWidth - popperMetric.width]', x, window.outerWidth - popperMetric.width)
                // console.log('[auto-toc, makeSticky, x, y, offsetX, offsetY]', x, y, offsetX, offsetY)
                // console.log('[auto-toc, makeSticky, scrollableTop, topMargin, ref.top, scrollY)', scrollableTop, topMargin, ref.top, scrollY)
                // // console.log('[auto-toc, makeSticky, scrollableTop + topMargin, ref.top - scrollY)', scrollableTop + topMargin, ref.top - scrollY)
                // console.log('[auto-toc, makeSticky, 3*(scrollableTop + TOP_MARGIN), 888 - scrollY', 3*(scrollableTop + TOP_MARGIN), 888 - scrollY)
                // console.log('[auto-toc, makeSticky, x + offsetX, y + offsetY]',x + offsetX, y + offsetY)
                // console.log('[auto-toc, makeSticky, ref.top, gap]',ref.top, gap)
                return {
                    position: "fixed",
                    left: 0,
                    top: 0,
                    // transform: translate3d(x + offsetX, y + offsetY)
                    transform: translate3d(final_x, final_y),
                };
            }
        );
    };

    const getOptimalContainerPos = function (article) {
        const { top, left, right, bottom, height, width } =
            article.getBoundingClientRect();

        const depthOf = function (elem) {
            let depth = 0;
            while (elem) {
                elem = elem.parentElement;
                depth++;
            }
            return depth;
        };
        const depthOfPoint = function ([x, y]) {
            const elem = document.elementFromPoint(x, y);
            return elem && depthOf(elem);
        };
        const gap = ARTICLE_TOC_GAP;
        const testWidth = 200;
        const testHeight = 400;
        const leftSlotTestPoints = [
            left - gap - testWidth,
            left - gap - testWidth / 2,
            left - gap,
        ]
            .map((x) =>
                [top, top + testHeight / 2, top + testHeight].map((y) => [x, y])
            )
            .reduce((prev, cur) => prev.concat(cur), []);
        const rightSlotTestPoints = [
            right + gap,
            right + gap + testWidth / 2,
            right + gap + testWidth,
        ]
            .map((x) =>
                [top, top + testHeight / 2, top + testHeight].map((y) => [x, y])
            )
            .reduce((prev, cur) => prev.concat(cur), []);
        const leftDepths = leftSlotTestPoints.map(depthOfPoint).filter(Boolean);
        const rightDepths = rightSlotTestPoints
            .map(depthOfPoint)
            .filter(Boolean);
        const leftAvgDepth = leftDepths.length
            ? leftDepths.reduce((a, b) => a + b, 0) / leftDepths.length
            : null;
        const rightAvgDepth = rightDepths.length
            ? rightDepths.reduce((a, b) => a + b, 0) / rightDepths.length
            : null;

        if (!leftAvgDepth) return { direction: "right" };
        if (!rightAvgDepth) return { direction: "left" };
        const spaceDiff = document.documentElement.offsetWidth - right - left;
        const scoreDiff =
            spaceDiff * 1 + (rightAvgDepth - leftAvgDepth) * 9 * -10 + 20; // I do like right better
        return scoreDiff > 0 ? { direction: "right" } : { direction: "left" };
    };

    const Container = function ({
        article,
        scrollable,
        $headings,
        theme,
        $activeHeading,
        $isShow,
        $userOffset,
        $relayout,
        $scroll,
        $topbarHeight,
        onClickHeading,
    }) {
        const handle = Handle({ $userOffset });
        const toc = TOC({ $headings, $activeHeading, onClickHeading });
        return {
            oncreate({ dom }) {
                const { direction } = getOptimalContainerPos(article);
                this.$style = makeSticky({
                    ref: article,
                    scrollable: scrollable,
                    popper: dom,
                    direction: direction,
                    gap: ARTICLE_TOC_GAP,
                    // $topMargin: $topbarHeight.map(h => (h || 0) + 50),
                    $topMargin: $topbarHeight.map((h) => TOP_MARGIN),
                    $refChange: $relayout,
                    $scroll: $scroll,
                    $offset: $userOffset,
                });
                this.$style.subscribe((_) => mithril.redraw());
            },
            view() {
                return mithril(
                    "#smarttoc.dark-scheme",
                    {
                        class: [
                            theme || "light",
                            $headings().filter((h) => h.level <= 2).length >
                                50 && "lengthy",
                            $isShow() ? "" : "hidden",
                        ]
                            .filter(Boolean)
                            .join(" "),
                        style: this.$style && this.$style(),
                    },
                    [mithril(handle), mithril(toc)]
                );
            },
        };
    };

    const Extender = function ({ $headings, scrollable, $isShow, $relayout }) {
        const $extender = Stream();
        // toc: extend body height so we can scroll to the last heading
        let extender = document.createElement("DIV");
        extender.id = "smarttoc-extender";
        Stream.combine($isShow, $relayout, $headings, (isShow, _, headings) => {
            setTimeout(() => {
                // some delay to ensure page is stable ?
                let lastHeading = headings.slice(-1)[0].node;
                let lastRect = lastHeading.getBoundingClientRect();
                let extenderHeight = 0;
                if (scrollable === document.body) {
                    let heightBelowLastRect =
                        document.documentElement.scrollHeight -
                        (lastRect.bottom + document.documentElement.scrollTop) -
                        num(extender.style.height); // in case we are there already
                    extenderHeight = isShow
                        ? Math.max(
                              window.innerHeight -
                                  lastRect.height -
                                  heightBelowLastRect,
                              0
                          )
                        : 0;
                } else {
                    let scrollRect = scrollable.getBoundingClientRect();
                    let heightBelowLastRect =
                        scrollRect.top +
                        scrollable.scrollHeight -
                        getScroll(scrollable) - // bottom of scrollable relative to viewport
                        lastRect.bottom -
                        num(extender.style.height); // in case we are there already
                    extenderHeight = isShow
                        ? Math.max(
                              scrollRect.height -
                                  lastRect.height -
                                  heightBelowLastRect,
                              0
                          )
                        : 0;
                }
                $extender({
                    height: extenderHeight,
                });
            }, 300);
        });
        $extender.subscribe((style) => applyStyle(extender, style));
        return extender;
    };

    const relayoutStream = function (article, $resize, $isShow) {
        const readableStyle = function (article) {
            let computed = window.getComputedStyle(article);
            let fontSize = num(computed.fontSize);
            let bestWidth = Math.min(Math.max(fontSize, 12), 16) * 66;
            if (computed["box-sizing"] === "border-box") {
                bestWidth +=
                    num(computed["padding-left"]) +
                    num(computed["padding-right"]);
            }

            return Object.assign(
                num(computed.marginLeft) || num(computed.marginRight)
                    ? {}
                    : {
                          marginLeft: "auto",
                          marginRight: "auto",
                      },
                num(computed.maxWidth)
                    ? {}
                    : {
                          maxWidth: bestWidth,
                      }
            );
        };
        let oldStyle = article.style.cssText;
        let newStyle = readableStyle(article);
        let $relayout = $isShow.map((isShow) => {
            if (isShow) {
                // 注释掉了下面这两行, 免得生成 toc 的时候导致页面重排, 很丑
                // applyStyle(article, newStyle)
                // return article
            } else {
                // applyStyle(article, oldStyle)
            }
        });
        return Stream.combine($relayout, $resize, () => null);
    };

    const addAnchors = function (headings) {
        const anchoredHeadings = headings.map(function ({
            node,
            level,
            anchor,
        }) {
            if (!anchor) {
                anchor =
                    node.id ||
                    [].slice
                        .apply(node.children)
                        .filter((elem) => elem.tagName === "A")
                        .map((a) => {
                            let href = a.getAttribute("href") || "";
                            return href.startsWith("#") ? href.substr(1) : a.id;
                        })
                        .filter(Boolean)[0];
                if (!anchor) {
                    anchor = node.id = unique(safe(node.textContent));
                } else {
                    anchor = unique(anchor);
                }
            }
            return { node, level, anchor };
        });

        // console.log("anchoredHeadings begin aaa")
        // console.log(anchoredHeadings)
        // console.log("anchoredHeadings end bbb")
        return anchoredHeadings;
    };

    const getScrollParent = function (elem) {
        const canScroll = (el) =>
            ["auto", "scroll"].includes(
                window.getComputedStyle(el).overflowY
            ) && el.clientHeight + 1 < el.scrollHeight;
        while (elem && elem !== document.body && !canScroll(elem)) {
            elem = elem.parentElement;
        }
        log("scrollable", elem);
        draw(elem, "purple");
        return elem;
    };

    const scrollStream = function (scrollable, $isShow) {
        let $scroll = Stream([
            getScroll(scrollable, "left"),
            getScroll(scrollable),
        ]);
        let source = scrollable === document.body ? window : scrollable;
        Stream.fromEvent(source, "scroll")
            .filter(() => $isShow())
            .throttle()
            .subscribe(() => {
                $scroll([getScroll(scrollable, "left"), getScroll(scrollable)]);
            });
        return $scroll;
    };

    const activeHeadingStream = function (
        $headings,
        scrollable,
        $scroll,
        $relayout,
        $topbarHeight
    ) {
        const $headingScrollYs = Stream.combine(
            $relayout,
            $headings,
            (_, headings) => {
                const scrollableTop =
                    (scrollable === document.body
                        ? 0
                        : scrollable.getBoundingClientRect().top) -
                    getScroll(scrollable, "top");
                return headings.map(
                    ({ node }) =>
                        node.getBoundingClientRect().top - scrollableTop
                );
            }
        );

        let $curIndex = Stream.combine(
            $headingScrollYs,
            $scroll,
            $topbarHeight,
            function (headingScrollYs, [scrollX, scrollY], topbarHeight = 0) {
                let i = 0;
                for (let len = headingScrollYs.length; i < len; i++) {
                    if (headingScrollYs[i] > scrollY + topbarHeight + 20) {
                        break;
                    }
                }
                return Math.max(0, i - 1);
            }
        );

        return $curIndex.unique();
    };

    const scrollToHeading = function (
        { node },
        scrollElem,
        onScrollEnd,
        topMargin = 0
    ) {
        scrollTo({
            targetElem: node,
            scrollElem: scrollElem,
            topMargin: topMargin,
            maxDuration: 188,
            callback: onScrollEnd && onScrollEnd.bind(null, node),
        });
    };

    const getTopBarHeight = function (topElem) {
        // 默认网页的顶部有个 bar, 而且默认这个 bar 的高度是 88, 保证点击 toc 的时候跳转可以网页多往下移一点, 免得被各种检测不出来的 bar 挡住
        return TOP_MARGIN;

        const findFixedParent = function (elem) {
            const isFixed = (elem) => {
                let { position, zIndex } = window.getComputedStyle(elem);
                return position === "fixed" && zIndex;
            };
            while (elem !== document.body && !isFixed(elem)) {
                elem = elem.parentElement;
            }
            return elem === document.body ? null : elem;
        };
        let { left, right, top } = topElem.getBoundingClientRect();
        let leftTopmost = document.elementFromPoint(left + 1, top + 1);
        let rightTopmost = document.elementFromPoint(right - 1, top + 1);
        if (
            leftTopmost &&
            rightTopmost &&
            leftTopmost !== topElem &&
            rightTopmost !== topElem
        ) {
            let leftFixed = findFixedParent(leftTopmost);
            let rightFixed = findFixedParent(rightTopmost);
            if (leftFixed && leftFixed === rightFixed) {
                return leftFixed.offsetHeight;
            } else {
                return 0;
            }
        } else {
            return 0;
        }
    };

    const getTheme = function (article) {
        let elem = article;
        try {
            const parseColor = (str) =>
                str
                    .replace(/rgba?\(/, "")
                    .replace(/\).*/, "")
                    .split(/, ?/);
            const getBgColor = (elem) =>
                parseColor(window.getComputedStyle(elem)["background-color"]);
            const isTransparent = ([r, g, b, a]) => a === 0;
            const isLight = ([r, g, b, a]) => r + g + b > (255 / 2) * 3;
            while (elem && elem.parentElement) {
                const color = getBgColor(elem);
                if (isTransparent(color)) {
                    elem = elem.parentElement;
                } else {
                    return isLight(color) ? "light" : "dark";
                }
            }
            return "light";
        } catch (e) {
            return "light";
        }
    };

    const getRoot = function () {
        let root = document.getElementById("smarttoc_wrapper");
        if (!root) {
            root = document.body.appendChild(document.createElement("DIV"));
            root.id = "smarttoc_wrapper";
        }
        return root;
    };

    // 生成目录
    function createTOC({
        article,
        $headings: $headings_,
        userOffset = [0, 0],
    }) {
        var domain2offset = GM_getValue(
            "menu_GAEEScript_auto_toc_domain_2_offset"
        );
        var lastOffset = domain2offset[window.location.host];
        console.log("[auto-toc, lastOffset]", lastOffset);
        if (lastOffset != null) {
            userOffset = lastOffset;
        }
        console.log("[auto-toc, init userOffset]", userOffset);

        const $headings = $headings_.map(addAnchors);
        insertCSS(getTocCss(), "smarttoc__css");

        const scrollable = getScrollParent(article);
        const theme = getTheme(article);
        log("theme", theme);

        const $isShow = Stream(true);
        const $topbarHeight = Stream();
        const $resize = Stream.combine(
            Stream.fromEvent(window, "resize"),
            Stream.fromEvent(document, "readystatechange"),
            Stream.fromEvent(document, "load"),
            Stream.fromEvent(document, "DOMContentLoaded"),
            () => null
        )
            .filter(() => $isShow())
            .throttle();
        const $scroll = scrollStream(scrollable, $isShow);
        const $relayout = relayoutStream(article, $resize, $isShow);
        const $activeHeading = activeHeadingStream(
            $headings,
            scrollable,
            $scroll,
            $relayout,
            $topbarHeight
        );
        const $userOffset = Stream(userOffset);

        // scrollable.appendChild(
        //   Extender({ $headings, scrollable, $isShow, $relayout })
        // )

        const onScrollEnd = function (node) {
            if ($topbarHeight() == null) {
                setTimeout(() => {
                    $topbarHeight(getTopBarHeight(node));
                    log("topBarHeight", $topbarHeight());
                    if ($topbarHeight()) {
                        scrollToHeading(
                            { node },
                            scrollable,
                            null,
                            $topbarHeight() + 10
                        );
                    }
                }, 300);
            }
        };

        const onClickHeading = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const anchor = e.target.getAttribute("href").substr(1);
            const heading = $headings().find(
                (heading) => heading.anchor === anchor
            );
            scrollToHeading(
                heading,
                scrollable,
                onScrollEnd,
                ($topbarHeight() || 0) + 10
            );
        };

        mithril.mount(
            getRoot(),
            Container({
                article,
                scrollable,
                $headings,
                theme,
                $activeHeading,
                $isShow,
                $userOffset,
                $relayout,
                $scroll,
                $topbarHeight,
                onClickHeading,
            })
        );

        // now show what we've found
        if (article.getBoundingClientRect().top > window.innerHeight - 50) {
            scrollToHeading(
                $headings()[0],
                scrollable,
                onScrollEnd,
                ($topbarHeight() || 0) + 10
            );
        }

        return {
            isValid: () =>
                document.body.contains(article) &&
                article.contains($headings()[0].node),

            isShow: () => $isShow(),

            toggle: () => $isShow(!$isShow()),

            next: () => {
                if ($isShow()) {
                    let nextIdx = Math.min(
                        $headings().length - 1,
                        $activeHeading() + 1
                    );
                    scrollToHeading(
                        $headings()[nextIdx],
                        scrollable,
                        onScrollEnd,
                        ($topbarHeight() || 0) + 10
                    );
                }
            },

            prev: () => {
                if ($isShow()) {
                    let prevIdx = Math.max(0, $activeHeading() - 1);
                    scrollToHeading(
                        $headings()[prevIdx],
                        scrollable,
                        onScrollEnd,
                        ($topbarHeight() || 0) + 10
                    );
                }
            },

            dispose: () => {
                log("dispose");
                $isShow(false);
                mithril.render(getRoot(), mithril(""));
                return { userOffset: $userOffset() };
            },
        };
    }

    const pathToTop = function (elem, maxLvl = -1) {
        assert(elem, "no element given");
        const path = [];
        while (elem && maxLvl--) {
            path.push(elem);
            elem = elem.parentElement;
        }
        return path;
    };

    const isStrongAlsoHeading = function (rootElement = document) {
        // return false
        return true;
        // return rootElement.querySelectorAll('p > strong:only-child').length >= 2
    };

    //////////////////////////////// 以下是新版提取文章和标题的部分(目前测出某些网站会导致页面排版错乱比如谷歌和https://www.163.com/dy/article/GJKFUO4105119NPR.html) //////////////////////////////////////////////////////////////////////
    //////////////////////////////// 所以退回后面的旧版的代码了 //////////////////////////////////////////////////////////////////////

    var toArray = function (arr) {
        return [].slice.apply(arr);
    };

    // var getAncestors = function (elem, maxDepth) {
    //     if (maxDepth === void 0) { maxDepth = -1; }
    //     var ancestors = [];
    //     var cur = elem;
    //     while (cur && maxDepth--) {
    //         ancestors.push(cur);
    //         cur = cur.parentElement;
    //     }
    //     return ancestors;
    // };

    // var canScroll = function (el) {
    //     return (['auto', 'scroll'].includes(window.getComputedStyle(el).overflowY) &&
    //         el.clientHeight + 1 < el.scrollHeight);
    // };

    // var ARTICLE_TAG_WEIGHTS = {
    //     h1: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.4; }),
    //     h2: [0, 100, 60, 40, 30, 25, 22, 18],
    //     h3: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.5; }),
    //     h4: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.5 * 0.5; }),
    //     h5: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.5 * 0.5 * 0.5; }),
    //     h6: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.5 * 0.5 * 0.5 * 0.5; }),
    //     strong: [0, 100, 60, 40, 30, 25, 22, 18].map(function (s) { return s * 0.5 * 0.5 * 0.5; }),
    //     article: [500],
    //     '.article': [500],
    //     '#article': [500],
    //     '.content': [101],
    //     sidebar: [-500, -100, -50],
    //     '.sidebar': [-500, -100, -50],
    //     '#sidebar': [-500, -100, -50],
    //     aside: [-500, -100, -50],
    //     '.aside': [-500, -100, -50],
    //     '#aside': [-500, -100, -50],
    //     nav: [-500, -100, -50],
    //     '.nav': [-500, -100, -50],
    //     '.navigation': [-500, -100, -50],
    //     '.toc': [-500, -100, -50],
    //     '.table-of-contents': [-500, -100, -50],
    //     '.comment': [-500, -100, -50]
    // };

    // 拿到离页面左边边缘最近的标题的距离
    var getElemsCommonLeft = function (elems) {
        if (!elems.length) {
            return undefined;
        }
        var lefts = {};
        elems.forEach(function (el) {
            var left = el.getBoundingClientRect().left;
            if (!lefts[left]) {
                lefts[left] = 0;
            }
            lefts[left]++;
        });
        var count = elems.length;
        var isAligned = Object.keys(lefts).length <= Math.ceil(0.3 * count);
        if (!isAligned) {
            return undefined;
        }
        var sortedByCount = Object.keys(lefts).sort(function (a, b) {
            return lefts[b] - lefts[a];
        });
        var most = Number(sortedByCount[0]);
        return most;
    };

    // const extractArticle = function (rootElement = document) {
    //     var elemScores = new Map();
    //     // weigh nodes by factor: "selector" "distance from this node"
    //     Object.keys(ARTICLE_TAG_WEIGHTS).forEach(function (selector) {
    //         var elems = (0, toArray)(rootElement.querySelectorAll(selector));
    //         if (selector.toLowerCase() === 'strong') {
    //             // for <strong> elements, only take them as heading when they align at left
    //             var commonLeft_1 = getElemsCommonLeft(elems);
    //             if (commonLeft_1 === undefined || commonLeft_1 > window.innerWidth / 2) {
    //                 elems = [];
    //             }
    //             else {
    //                 elems = elems.filter(function (elem) { return elem.getBoundingClientRect().left === commonLeft_1; });
    //             }
    //         }
    //         elems.forEach(function (elem) {
    //             var weights = ARTICLE_TAG_WEIGHTS[selector];
    //             var ancestors = getAncestors(elem, weights.length);
    //             ancestors.forEach(function (elem, distance) {
    //                 elemScores.set(elem, (elemScores.get(elem) || 0) + weights[distance] || 0);
    //             });
    //         });
    //     });
    //     var sortedByScore = [...elemScores].sort(function (a, b) { return b[1] - a[1]; });
    //     // pick top 5 node to re-weigh
    //     var candicates = sortedByScore
    //         .slice(0, 5)
    //         .filter(Boolean)
    //         .map(function (_a) {
    //             var elem = _a[0], score = _a[1];
    //             return { elem: elem, score: score };
    //         });
    //     // re-weigh by factor:  "take-lots-vertical-space", "contain-less-links", "not-too-narrow", "cannot-scroll"
    //     var isTooNarrow = function (e) { return e.scrollWidth < 400; }; // rule out sidebars
    //     candicates.forEach(function (candicate) {
    //         if (isTooNarrow(candicate.elem)) {
    //             candicate.score = 0;
    //             candicates.forEach(function (parent) {
    //                 if (parent.elem.contains(candicate.elem)) {
    //                     parent.score *= 0.7;
    //                 }
    //             });
    //         }
    //         if ((0, canScroll)(candicate.elem) && candicate.elem !== rootElement.body) {
    //             candicate.score *= 0.5;
    //         }
    //     });
    //     var reweighted = candicates
    //         .map(function (_a) {
    //             var elem = _a.elem, score = _a.score;
    //             return {
    //                 elem: elem,
    //                 score: score *
    //                     Math.log((elem.scrollHeight * elem.scrollHeight) /
    //                         (elem.querySelectorAll('a').length || 1))
    //             };
    //         })
    //         .sort(function (a, b) { return b.score - a.score; });
    //     var article = reweighted.length ? reweighted[0].elem : undefined;

    //     console.log('[extract]', {
    //         elemScores: elemScores,
    //         sortedByScore: sortedByScore,
    //         candicates: candicates,
    //         reweighted: reweighted
    //     });

    //     return article;
    // }

    // var HEADING_TAG_WEIGHTS = {
    //     H1: 4,
    //     H2: 9,
    //     H3: 9,
    //     H4: 10,
    //     H5: 10,
    //     H6: 10,
    //     STRONG: 5
    // };
    // var extractHeadings = function (articleDom) {
    //     var isVisible = function (elem) { return elem.offsetHeight !== 0; };
    //     var isHeadingGroupVisible = function (group) {
    //         return group.elems.filter(isVisible).length >= group.elems.length * 0.5;
    //     };
    //     var headingTagGroups = Object.keys(HEADING_TAG_WEIGHTS)
    //         .map(function (tag) {
    //             var elems = (0, toArray)(articleDom.getElementsByTagName(tag));
    //             if (tag.toLowerCase() === 'strong') {
    //                 // for <strong> elements, only take them as heading when they align at left
    //                 var commonLeft_2 = getElemsCommonLeft(elems);
    //                 if (commonLeft_2 === undefined || commonLeft_2 > window.innerWidth / 2) {
    //                     elems = [];
    //                 }
    //                 else {
    //                     elems = elems.filter(function (elem) { return elem.getBoundingClientRect().left === commonLeft_2; });
    //                 }
    //             }
    //             return {
    //                 tag: tag,
    //                 elems: elems,
    //                 score: elems.length * HEADING_TAG_WEIGHTS[tag]
    //             };
    //         })
    //         .filter(function (group) { return group.score >= 10 && group.elems.length > 0; })
    //         .filter(function (group) { return isHeadingGroupVisible(group); })
    //         .slice(0, 3);
    //     // use document sequence
    //     var headingTags = headingTagGroups.map(function (headings) { return headings.tag; });
    //     var acceptNode = function (node) {
    //         var group = headingTagGroups.find(function (g) { return g.tag === node.tagName; });
    //         if (!group) {
    //             return NodeFilter.FILTER_SKIP;
    //         }
    //         return group.elems.includes(node) && isVisible(node)
    //             ? NodeFilter.FILTER_ACCEPT
    //             : NodeFilter.FILTER_SKIP;
    //     };
    //     var treeWalker = document.createTreeWalker(articleDom, NodeFilter.SHOW_ELEMENT, { acceptNode: acceptNode });
    //     var headings = [];
    //     var id = 0;
    //     while (treeWalker.nextNode()) {
    //         var node = treeWalker.currentNode;
    //         // var anchor = node.id ||
    //         // 	(0, toArray)(node.querySelectorAll('a'))
    //         // 		.map(function (a) {
    //         // 			var href = a.getAttribute('href') || '';
    //         // 			return href.startsWith('#') ? href.substr(1) : a.id;
    //         // 		})
    //         // 		.filter(Boolean)[0];
    //         // headings.push({
    //         // 	node: node,
    //         // 	text: node.textContent || '',
    //         // 	level: headingTags.indexOf(node.tagName) + 1,
    //         // 	id: id,
    //         // 	anchor: anchor
    //         // });
    //         headings.push({
    //             node,
    //             level: headingTags.indexOf(node.tagName) + 1,
    //         })
    //         id++;
    //     }
    //     console.log("headingsssss new begin")
    //     console.log(headings)
    //     console.log("headingsssss new end")
    //     return headings;
    // };

    ///////////////////////////////////////////////// 上面的是新版, 下面的是旧版 ////////////////////////

    const extractArticle = function (rootElement = document) {
        log("extracting article");

        const scores = new Map();

        function addScore(elem, inc) {
            scores.set(elem, (scores.get(elem) || 0) + inc);
        }

        function updateScore(elem, weight) {
            let path = pathToTop(elem, weight.length);
            path.forEach((elem, distance) => addScore(elem, weight[distance]));
        }

        // weigh nodes by factor: "selector", "distance from this node"
        const weights = {
            h1: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.4),
            h2: [0, 100, 60, 40, 30, 25, 22],
            h3: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5),
            h4: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5 * 0.5),
            h5: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5 * 0.5 * 0.5),
            h6: [0, 100, 60, 40, 30, 25, 22].map(
                (s) => s * 0.5 * 0.5 * 0.5 * 0.5
            ),
            article: [500],
            ".article": [500],
            ".content": [101],
            sidebar: [-500],
            ".sidebar": [-500],
            aside: [-500],
            ".aside": [-500],
            nav: [-500],
            ".nav": [-500],
            ".navigation": [-500],
            ".toc": [-500],
            ".table-of-contents": [-500],
        };
        const selectors = Object.keys(weights);
        selectors
            .map((selector) => ({
                selector: selector,
                elems: [].slice.apply(rootElement.querySelectorAll(selector)),
            }))
            .forEach(({ selector, elems }) =>
                elems.forEach((elem) => updateScore(elem, weights[selector]))
            );
        const sorted = [...scores].sort((a, b) => b[1] - a[1]);

        // reweigh top 5 nodes by factor:  "take-lots-vertical-space", "contain-less-links", "too-narrow"
        let candicates = sorted
            .slice(0, 5)
            .filter(Boolean)
            .map(([elem, score]) => ({ elem, score }));

        let isTooNarrow = (e) => e.scrollWidth < 400; // rule out sidebars

        candicates.forEach((c) => {
            if (isTooNarrow(c.elem)) {
                c.isNarrow = true;
                candicates.forEach((parent) => {
                    if (parent.elem.contains(c.elem)) {
                        parent.score *= 0.7;
                    }
                });
            }
        });
        candicates = candicates.filter((c) => !c.isNarrow);

        const reweighted = candicates
            .map(({ elem, score }) => [
                elem,
                score *
                    Math.log(
                        (elem.scrollHeight * elem.scrollHeight) /
                            (elem.querySelectorAll("a").length || 1)
                    ),
                elem.scrollHeight,
                elem.querySelectorAll("a").length,
            ])
            .sort((a, b) => b[1] - a[1]);

        const article = reweighted.length ? reweighted[0][0] : null;

        // console.log('[extracttttttttttt]', {
        //     scores: scores,
        //     sorted: sorted,
        //     candicates: candicates,
        //     reweighted: reweighted
        // });
        return article;
    };

    const extractHeadings = function (article) {
        log("extracting heading");

        // what to be considered as headings
        // const tags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].concat(
        //     isStrongAlsoHeading(article) ? 'STRONG' : []
        // )
        const header_tags = ["H1", "H2", "H3", "H4", "H5", "H6"];
        const tags = header_tags.concat(["STRONG", "B"]);
        const tagWeight = (tag) =>
            ({ H1: 4, H2: 9, H3: 9, H4: 10, H5: 10, H6: 10, STRONG: 10, B: 10 }[
                tag
            ]);
        const isVisible = (elem) => elem.offsetHeight !== 0;
        const isGroupVisible = (headings) =>
            headings.filter(isVisible).length >= headings.length * 0.5;
        // var headingGroup = tags
        //     .map(tag => [].slice.apply(article.getElementsByTagName(tag)))
        // const mm1 = headingGroup
        //     .map((headings, i) => ({
        //         elems: headings,
        //         tag: tags[i],
        //         score: headings.length * tagWeight(tags[i])
        //     }))

        // const mm2 = mm1
        //     .filter(heading => heading.score >= 10)
        // const mm3 = mm2
        //     .filter(heading => isGroupVisible(heading.elems))
        // const mm4 = mm3
        //     .slice(0, 3)
        // headingGroup = mm4

        var headingGroup = tags.map(function (tag) {
            var elems = (0, toArray)(article.getElementsByTagName(tag));
            if (tag.toLowerCase() === "strong" || tag.toLowerCase() === "b") {
                // for <strong> elements, only take them as heading when they align at left
                var commonLeft_2 = getElemsCommonLeft(elems);
                // console.log("commonLeft_2 old begin")
                // console.log(commonLeft_2)
                // console.log(window.innerWidth / 2)
                // console.log(elems)
                // if (commonLeft_2 === undefined || commonLeft_2 > window.innerWidth / 2) {
                if (commonLeft_2 === undefined) {
                    elems = [];
                } else {
                    elems = elems.filter(function (elem) {
                        // 当前 elem 离左边距离得和 commonLeft_2 一样, 并且当前 elem 不能是正经标题的子元素, 否则会重复; 当加粗的文字后面还有普通不加粗的文字则不识别为标题
                        return (
                            elem.getBoundingClientRect().left ===
                                commonLeft_2 &&
                            !header_tags.includes(elem.parentElement.tagName) &&
                            elem.parentElement.childNodes.length == 1
                        );
                    });
                }
                // console.log(elems)
                // console.log("commonLeft_2 old end")
            }
            return {
                tag: tag,
                elems: elems,
                score: elems.length * tagWeight(tag),
            };
        });
        var mm1 = headingGroup
            .filter(function (group) {
                return group.score >= 10 && group.elems.length > 0;
            })
            .filter(function (group) {
                return isVisible(group);
            })
            .slice(0, 3);
        headingGroup = mm1;

        // use document sequence
        const validTags = headingGroup.map((headings) => headings.tag);
        // 记录一下已经找到的要显示的标题名字最终放到 finalInnerHTML 里
        const valid_innerHTML = headingGroup.map((headings) =>
            headings.elems.map((node) => node.innerHTML)
        );
        var finalInnerHTML = [];
        valid_innerHTML.forEach(function (arr) {
            finalInnerHTML = finalInnerHTML.concat(arr);
        });
        // 筛选页面上想要遍历的 node
        const acceptNode = (node) =>
            validTags.includes(node.tagName) &&
            isVisible(node) &&
            finalInnerHTML.includes(node.innerHTML)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
        const treeWalker = document.createTreeWalker(
            article,
            NodeFilter.SHOW_ELEMENT,
            { acceptNode }
        );
        const headings = [];

        while (treeWalker.nextNode()) {
            // 按照页面上的显示顺序遍历
            let node = treeWalker.currentNode;
            headings.push({
                node,
                // strong 粗体字类型的标题那 level 就直接是 1 就好了, 免得显示不出来
                level:
                    node.tagName.toLowerCase() === "strong" ||
                    node.tagName.toLowerCase() === "b"
                        ? 1
                        : validTags.indexOf(node.tagName) + 1,
            });
        }

        // console.log("headingsssss old begin")
        // console.log(validTags)
        // console.log(headings)
        // console.log("headingsssss old end")

        return headings;
    };

    ////////////////////////////////////////////////////////////////////////////////

    function extract() {
        const article = extractArticle(document);
        let $headings;
        if (article) {
            $headings = Stream(extractHeadings(article));

            const $articleChange = Stream(null);
            const observer = new MutationObserver((_) => $articleChange(null));
            observer.observe(article, { childList: true });

            $articleChange.throttle(200).subscribe((_) => {
                let headings = extractHeadings(article);
                if (headings && headings.length) {
                    $headings(headings);
                }
            });
        }

        return [article, $headings];
    }

    ////////////////////////////////

    let toc;

    const doGenerateToc = function (option = {}) {
        let [article, $headings] = extract();
        if (article && $headings && $headings().length) {
            console.log("createTOC before old begin aaa");
            console.log($headings());
            console.log("createTOC before old end bbb");

            return createTOC(Object.assign({ article, $headings }, option));
        } else {
            return null;
        }
    };

    function handleToc() {
        var domain2shouldShow = GM_getValue("menu_GAEEScript_auto_open_toc");
        console.log("[handleToc domain2shouldShow]", domain2shouldShow);
        console.log("[handleToc window.location.host]", window.location.host);
        console.log(
            "[domain2shouldShow[window.location.host]]",
            domain2shouldShow[window.location.host]
        );

        var timerId = setInterval(() => {
            // console.log('[handleToc regen toc window.location.host]', window.location.host);
            // clearInterval(timerId);
            if (!domain2shouldShow[window.location.host]) {
                // 防止正在循环尝试生成 toc 的时候用户关闭了 toc 开关
                return;
            }
            if (toc && !toc.isValid()) {
                let lastState = toc.dispose();
                toc = doGenerateToc(lastState);
            } else if (toc == null) {
                toc = doGenerateToc();
            }
        }, 1600);

        if (domain2shouldShow[window.location.host]) {
            toc = doGenerateToc();
            console.log("[handleToc toc]", toc);
            // 如果生成的toc有问题或者toc没生成出来, 那就 n 秒之后再生成一次(比如掘金的很多文章得过几秒钟再生成才行)
            // toast('Will generate TOC in 2.8 seconds ...', 1600);
            setTimeout(() => {
                if ((toc && !toc.isValid()) || toc == null) {
                    toast("No article/headings are detected.");
                }
            }, 3800);
        } else {
            console.log("[handleToc should not show]", toc);
            if (toc) {
                toc.dispose();
            }
        }
    }

    var menu_ALL = [
            [
                "menu_GAEEScript_auto_open_toc",
                "Enable TOC on current site(当前网站TOC开关)",
                {},
            ],
            [
                "menu_GAEEScript_auto_collapse_toc",
                "Collapse TOC on current site(当前网站TOC自动折叠开关)",
                {},
            ],
        ],
        menu_ID = [];

    function handleMenu() {
        // console.log("")
        for (let i = 0; i < menu_ALL.length; i++) {
            // 如果读取到的值为 null 就写入默认值
            // console.log("debug ssss")
            if (GM_getValue(menu_ALL[i][0]) == null) {
                // console.log("debug ssss 11")
                GM_setValue(menu_ALL[i][0], menu_ALL[i][2]);
            }
        }
        registerMenuCommand();
    }

    // 注册脚本菜单
    function registerMenuCommand() {
        for (let i = 0; i < menu_ID.length; i++) {
            // console.log("debug ssss 22, aa")
            // console.log(menu_ID)

            // 因为 safari 的各个油猴平台都还没支持好 GM_unregisterMenuCommand , 所以先只让非 safari 的跑, 这会导致 safari 里用户关闭显示 toc 开关的时候, 相关菜单的✅不会变成❎
            if (
                !(
                    /Safari/.test(navigator.userAgent) &&
                    !/Chrome/.test(navigator.userAgent)
                )
            ) {
                // alert("非safari");
                GM_unregisterMenuCommand(menu_ID[i]);
            }
            // console.log("debug ssss 22, bb")
        }
        for (let i = 0; i < menu_ALL.length; i++) {
            // 循环注册脚本菜单
            var currLocalStorage = GM_getValue(menu_ALL[i][0]);
            menu_ID[menu_ID.length + 1] = GM_registerMenuCommand(
                `${currLocalStorage[window.location.host] ? "✅" : "❎"} ${
                    menu_ALL[i][1]
                }`,
                // `${menu_ALL[i][1]}`,
                function () {
                    menuSwitch(`${menu_ALL[i][0]}`);
                }
            );
            // menu_ID[menu_ID.length + 1] = GM_registerMenuCommand(
            //     `${currLocalStorage[window.location.host] ? '✅' : '❎'} ${window.location.host}`,
            //     function () {
            //         menuSwitch(`${menu_ALL[i][0]}`)
            //     }
            // );

            // console.log("debug ssss , aa")
            // console.log(menu_ID)
            // console.log("debug ssss , bb")
        }
        // menu_ID[menu_ID.length] = GM_registerMenuCommand(`🏁 当前版本 ${version}`);
        //menu_ID[menu_ID.length] = GM_registerMenuCommand('💬 反馈 & 建议', function () {window.GM_openInTab('', {active: true,insert: true,setParent: true});});
    }

    //切换选项
    function menuSwitch(localStorageKeyName) {
        // console.log("debug ssss 33")
        var domain2isCollapse = GM_getValue(
            "menu_GAEEScript_auto_collapse_toc"
        );
        if (localStorageKeyName === "menu_GAEEScript_auto_open_toc") {
            var domain2isShow = GM_getValue(`${localStorageKeyName}`);
            var domain2offset = GM_getValue(
                "menu_GAEEScript_auto_toc_domain_2_offset"
            );
            console.log(
                "[menuSwitch menu_GAEEScript_auto_open_toc]",
                domain2isShow
            );
            var isCurrShow = domain2isShow[window.location.host];
            if (isCurrShow == null || !isCurrShow) {
                domain2isShow[window.location.host] = true;
                toast("Turn On TOC.");
            } else {
                delete domain2isShow[window.location.host];
                delete domain2offset[window.location.host];
                delete domain2isCollapse[window.location.host];

                toast("Turn Off TOC.");
            }
            GM_setValue(`${localStorageKeyName}`, domain2isShow);
            GM_setValue(
                "menu_GAEEScript_auto_toc_domain_2_offset",
                domain2offset
            );
            GM_setValue("menu_GAEEScript_auto_collapse_toc", domain2isCollapse);
        } else if (
            localStorageKeyName === "menu_GAEEScript_auto_collapse_toc"
        ) {
            console.log(
                "[menuSwitch menu_GAEEScript_auto_collapse_toc]",
                domain2isCollapse
            );
            var isCurrCollapse = domain2isCollapse[window.location.host];
            if (isCurrCollapse == null || !isCurrCollapse) {
                domain2isCollapse[window.location.host] = true;
                toast("Turn On TOC Auto Collapse.");
            } else {
                delete domain2isCollapse[window.location.host];
                toast("Turn Off TOC Auto Collapse.");
            }
            GM_setValue(`${localStorageKeyName}`, domain2isCollapse);
        }
        // if((/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
        //     alert("这是safari")
        // }
        // 因为 safari 的各个油猴平台都还没支持好 GM_unregisterMenuCommand , 所以先只让非 safari 的跑, 这会导致 safari 里用户关闭显示 toc 开关的时候, 相关菜单的✅不会变成❎
        if (
            !(
                /Safari/.test(navigator.userAgent) &&
                !/Chrome/.test(navigator.userAgent)
            )
        ) {
            // alert("非safari");
            registerMenuCommand(); // 重新注册脚本菜单
        }
        handleToc();
        // location.reload(); // 刷新网页
    }

    if (isMasterFrame(window)) {
        // if (true) {
        console.log("auto_toc running !!!");
        // 貌似无用
        // 可以检查pageshow 事件的persisted属性，当页面初始化加载的时候，persisted被设置为false，当页面从缓存中加载的时候，persisted被设置为true。因此，上面代码的意思就是：
        // 如果页面是从缓存中加载的，那么页面重新加载。
        // window.onpageshow = function(event) {
        //     if (event.persisted) {
        //         // window.location.reload()
        //         console.log("ex-smart-toc handle toc when open web from cache !!!")
        //         handleToc()
        //     }
        // };

        // if( ('onhashchange' in window) && ((typeof document.documentMode==='undefined') || document.documentMode==8)) {
        //     // 浏览器支持onhashchange事件
        //     console.log("ex-smart-toc register window.onhashchange to handleToc !!!")
        //     // window.onhashchange = handleToc;  // 对应新的hash执行的操作函数
        //     window.onhashchange = function(event) {
        //         console.log("ex-smart-toc window.onhashchange trigger handleToc !!!")
        //         handleToc()
        //     }
        // } else {
        // 不支持则用定时器检测的办法
        //     setInterval(function() {
        //         // 检测hash值或其中某一段是否更改的函数， 在低版本的iE浏览器中通过window.location.hash取出的指和其它的浏览器不同，要注意
        // 　　　　 var ischanged = isHashChanged();
        //         if(ischanged) {
        //             handleToc();  // 对应新的hash执行的操作函数
        //         }
        //     }, 150);
        // }

        // console.log("ex-smart-toc innerWidth", window.innerWidth)
        // console.log("ex-smart-toc outerWidth", window.outerWidth)

        handleMenu();

        if (GM_getValue("menu_GAEEScript_auto_toc_domain_2_offset") == null) {
            GM_setValue("menu_GAEEScript_auto_toc_domain_2_offset", {});
        }
        if (GM_getValue("menu_GAEEScript_auto_collapse_toc") == null) {
            GM_setValue("menu_GAEEScript_auto_collapse_toc", {});
        }
        handleToc();

        // setTimeout(function() {
        //     handleToc();
        // }, 2800);
    }
})();
