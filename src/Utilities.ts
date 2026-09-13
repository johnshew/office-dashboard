import * as React from 'react';
import type { FileAttachment } from '@microsoft/microsoft-graph-types';

export function Hook(rootObject: any, functionToHook: string, hookingFunction: (...optionalParams: any[]) => void): void {
    var previousFunction = rootObject[functionToHook];

    rootObject[functionToHook] = (...optionalParams: any[]) => {
        hookingFunction.apply(null,optionalParams);
        previousFunction.apply(rootObject, optionalParams);
    }

    return previousFunction;
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
        return direction * (Number(x > y) - Number(y > x));
    }
}

export enum Days { Mon = 1, Tue, Wed, Thu, Fri, Sat, Sun }

export function ShortTimeString(dateString: string) {
    const today = new Date();
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toDateString() === today.toDateString()
        ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : date.toLocaleDateString('en-US', {
            weekday: 'short', month: 'numeric', day: 'numeric',
            ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {})
        });
}

export interface AttachmentDictionary {
    [index:string]: FileAttachment;
}

export class MessageAttachments {
    constructor(public messageId: string, public attachments?: AttachmentDictionary) {
        this.attachments = {}
        if (attachments)
            for(var key in attachments)
                this.attachments[key] = attachments[key];
    }
}
