import * as React from 'react';

export class Storage {
    constructor() { }

    public static setItem(key: string, data: any) {
        if (localStorage) {
            try {
                localStorage.setItem(key, JSON.stringify({ data: data }));
            }
            catch (e) {
                console.log("localStorage error " + e);
            }
        }
    }

    public static getItem(key: string): any {
        if (localStorage) {
            try {
                var data = JSON.parse(localStorage.getItem(key));
                return data && data.data;
            }
            catch (e) {
                console.log('localStorage read error ' + e);
            }
        }
        return null;
    }

    public static removeItem(key: string): any {
        if (localStorage) {
            try {
                localStorage.removeItem(key);
            }
            catch (e) {
                console.log('localStorage remove error ' + e);
            }
        }
    }
}

export function Hook(rootObject: any, functionToHook: string, hookingFunction: (...optionalParams: any[]) => void): void {
    var previousFunction = rootObject[functionToHook];

    rootObject[functionToHook] = (...optionalParams: any[]) => {
        hookingFunction.apply(null,optionalParams);
        previousFunction.apply(rootObject, optionalParams);
    }

    return previousFunction;
}

export function ObjectAssign(target, ...args) {
    if (target === undefined || target === null) {
        throw new TypeError('Cannot convert undefined or null to object');
    }

    var output = Object(target);
    for (var index = 1; index < arguments.length; index++) {
        var source = arguments[index];
        if (source !== undefined && source !== null) {
            for (var nextKey in source) {
                if (source.hasOwnProperty(nextKey)) {
                    output[nextKey] = source[nextKey];
                }
            }
        }
    }
    return output;
}

export function Combine(...styles: React.CSSProperties[]): React.CSSProperties {  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}

export function sortBy(key?: (any) => any, reverse?: boolean) {
    var direction = !reverse ? 1 : -1;
    return (a: any, b: any) => {
        var x = key(a), y = key(b);
        return direction * ((x as any > y as any) - (y as any > x as any));
    }
}

export class DebugConsole {
    console : HTMLDivElement;
    logger : HTMLDivElement;
    command : HTMLInputElement;

    public constructor() {
        this.console = document.getElementById("DebugConsole") as HTMLDivElement;
        this.command = document.getElementById("DebugCommand") as HTMLInputElement;
        this.logger = document.getElementById("DebugLog") as HTMLDivElement;

        if (!this.console || !this.command || !this.logger) { alert("Unable to initialize local console"); return; }

        Hook(console, "log", this.Log );

        this.console.style.display = "";
        this.command.onchange = () => {
            var result = ""
            try { result = eval(this.command.value); } catch (err) { result = "Unable to evaluate " + this.command.value + " with error " + err.toString(); }
            console.log(result);
            try { this.command.scrollIntoView(); } catch (err) { }
        }
    }

    public Log = (...args : any[]) => {
        var message = args && args[0];
        if (message) {
            try {
                message = typeof message == "string" ? message : JSON.stringify(message);
            }
            catch (err) {
                message = "[Could not stringify object]";
            };
        }
        if (message) { this.logger.innerHTML += '<p>' + message + '</p>'; }
    }
}

export var LocalConsole = null;

export function LocalConsoleInitialize() {
    LocalConsole = new DebugConsole();
}
