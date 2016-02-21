import * as React from 'react';

export class Storage {
    constructor() { }
    public setItem(key: string, data: any) {
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
}



export function Hook(rootObject: any, functionToHook: string, hookingFunction: (...optionalParams: any[]) => void): void {
    var previousFunction = rootObject[functionToHook];

    rootObject[functionToHook] = (...optionalParams: any[]) => {
        hookingFunction(optionalParams);
        previousFunction.apply(rootObject, optionalParams);
    }
    return previousFunction;
}


export function CreateCookie(name: string, value: string, days: number): void {
    var expires: string;
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    } else {
        expires = "";
    }

    document.cookie = name + "=" + value + expires + "; path=/";
}

export function ReadCookie(name: string): string {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1, c.length);
        }

        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }
    return "";
}

// Polyfills

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

// if (typeof Object["assign"] != 'function') {
//    Object["assign"] = ObjectAssign
//}

export function Combine(...styles: React.CSSProperties[]): React.CSSProperties {  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}
