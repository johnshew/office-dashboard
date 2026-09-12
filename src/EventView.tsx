import * as React from 'react';
import type { Event } from '@microsoft/microsoft-graph-types';
import * as Utilities from './Utilities';

import ItemViewHtmlBody from './ItemViewHtmlBody';

import Combine = Utilities.Combine;

const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '16pt',
    fontSize: '13pt'
}

const smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
}

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const bodyStyle: React.CSSProperties = {
    paddingRight: 10,
    paddingLeft: 10,
}

const plainTextStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap"
}

interface EventViewProps {
    event: Event;
    style?: React.CSSProperties;
}

export default class EventView extends React.Component<EventViewProps, any> {
    private attendees() {
        var x = this.props.event.attendees || [];
        return x.reduce<string>((p, a) => {
            var result = ((p != null) ? p + '; ' : '') + a.emailAddress.name;
            return result;
        }, null);
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var messageBody = Combine(bodyStyle, this.props.style);
        var event = this.props.event;
        if (!event) { return null; }
        var subject = event.subject || "";
        var organizer = event.organizer && event.organizer.emailAddress && event.organizer.emailAddress.name || "";
        var attendees = this.attendees() || "";
        var location = event.location && event.location.displayName;
        var body = event.body && event.body.content || "";
        if (event.body && event.body.contentType === "text") {
            messageBody = Combine(messageBody, plainTextStyle);
        }
        return (
            <div>
                <div className="well" style={  { padding: 10 } }>
                    <p style={ big }>{organizer}</p>
                    <p style={ smallEmphasis }>{subject}</p>
                    <p style={ small }>{attendees}</p>
                    <p style={ small }>{ location }</p>
                </div>

                <ItemViewHtmlBody style={messageBody} body={body} plainText={event.body?.contentType === "text"} />
            </div>
        );
    }
}
