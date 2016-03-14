import * as React from 'react';
import * as Utilities from '../lib/utilities';

import Combine = Utilities.Combine;

const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '16pt',
    fontSize: '13pt'
};

const smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
};

const tightStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 0,
    marginBottom: 0
};

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const summaryStyle: React.CSSProperties = {
    padding: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const selectedSummaryStyle = Combine(summaryStyle, {
    backgroundColor: "LightBlue"
});

interface EventSummaryProps extends React.Props<EventSummary> {
    event: Kurve.EventDataModel;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId: string);
}

class DateSpan {
    public days: number;
    public hours: number;
    public minutes: number;

    constructor(e: any, s: any) {
        var em = typeof e == 'string' ? Date.parse(e) : typeof e == 'number' ? e : typeof e == 'Date' ? (e as Date).getTime() : null;
        var sm = typeof s == 'string' ? Date.parse(s) : typeof s == 'number' ? s : typeof s == 'Date' ? (s as Date).getTime() : null;
        if (!sm || !em) throw new Error("DataSpan: constructor bad argument type");
        this.minutes = Math.floor((em - sm) / (60 * 1000));
        this.hours = Math.floor(this.minutes / 60);
        this.days = Math.floor(this.hours / 24);
        this.hours -= this.days * 24;
        this.minutes -= ((this.days * 24) + this.hours) * 60;
    }
}

export default class EventSummary extends React.Component<EventSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
        this.props.onSelect(this.props.event.id);
    };
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        var event = this.props.event;
        if (event.start.timeZone != "UTC") throw "Unexpected date format";

        var startTime = new Date(event.start.dateTime + 'Z').toLocaleTimeString().replace(/\u200E/g, "").replace(/:\d\d\s/, " ");
        var span = new DateSpan(event.end.dateTime, event.start.dateTime);
        var duration = ((span.days != 0) ? span.days + " days " : "") + (span.hours != 0 ? span.hours + " hours " : "") + (span.minutes != 0 ? span.minutes + " mins " : "");
        var location = event.location && event.location.displayName;
        var organizer = event.organizer && event.organizer.emailAddress && event.organizer.emailAddress.name;

        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{startTime + (duration ? " / " + duration : "") }</p>
                { event.subject ? <p style={ smallBold }> { event.subject } </p> : null }
                { location ? <p style={ small }>{ location }</p> : null}
            </div>
        );
    }
}
