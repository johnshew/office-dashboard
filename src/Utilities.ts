import * as React from 'react';

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
        return direction * ((x as any > y as any) - (y as any > x as any));
    }
}

export enum Days { Mon = 1, Tue, Wed, Thu, Fri, Sat, Sun }

export function ShortTimeString(dateString: string) {
    var today = new Date();
    var date = new Date(dateString);

    if (date.toDateString() === today.toDateString()) {
        var hours = date.getHours();
        var suffix = " AM";
        if (hours == 0) {
            hours = 12;
        } else if (hours >= 12) {
            suffix = " PM";
            hours -= 12;
        }
        var minutes = date.getMinutes().toString();
        if (minutes.length == 1) {
            minutes = "0" + minutes;
        }
        return hours + ":" + minutes + suffix;
    } else {
        return Days[date.getDay()] + " " + date.getMonth() + "/" + date.getDate();
    }
}

export interface AttachmentDictionary {
    [index:string]: Kurve.AttachmentDataModel;
}

export class MessageAttachments {
    constructor(public messageId: string, public attachments?: AttachmentDictionary) {
        this.attachments = {}
        if (attachments)
            for(var key in attachments)
                this.attachments[key] = attachments[key];
    }
}
