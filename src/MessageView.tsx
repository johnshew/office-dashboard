import * as React from 'react';

import * as Utilities from './Utilities';
import ItemViewHtmlBody from './ItemViewHtmlBody';

import Combine = Utilities.Combine;
import ShortTimeString = Utilities.ShortTimeString;

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

interface MessageViewProps extends React.Props<MessageView> {
    message?: Kurve.MessageDataModel;
    style?: React.CSSProperties;
}

export default class MessageView extends React.Component<MessageViewProps, any> {
    private Header: HTMLDivElement;

    private recipients(mailboxes: Kurve.Recipient[], style: React.CSSProperties, prefix: string) {
        if (!mailboxes)
            return;
        var recipientList = mailboxes.reduce((p, c) => { return (p ? p + "; " : "") + c.emailAddress.name; }, null);
        if (recipientList) {
            return <p style={ style }> { prefix }: { recipientList }</p>;
        }
        return null;
    }

    public scrollToTop() {
        try { this.Header.scrollIntoView(); } catch (err) { }
    }

    render() {
        var message = this.props.message;
        if (!message) { return null; }
        
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var messageBody = Combine(bodyStyle, this.props.style);
        if (message.body && message.body.contentType === "text" || !message.body && message.bodyPreview)
            messageBody = Combine(messageBody, plainTextStyle);
        
        console.log("rendering message", message.subject);
        var sender = message.sender && message.sender.emailAddress && message.sender.emailAddress.name;
        var from = sender ? <p style={ big }>{from}</p> : null;
        var body = message.body && message.body.content || message.bodyPreview;
        var received = message.receivedDateTime ? <p style={ small }>{ ShortTimeString(message.receivedDateTime) }</p> : null;
        var subject = message.subject ? <p style={ smallEmphasis }>{message.subject}</p> : null;

        return (
            <div>
                <div ref={ (c) => { this.Header = c; } }  className="well" style={ { padding: 10 } }>
                    { from }
                    { subject }
                    { this.recipients(message.toRecipients, small, "To") }
                    { this.recipients(message.ccRecipients, small, "Cc") }
                    { this.recipients(message.bccRecipients, small, "Bcc") }
                    { received }
                </div>

                <ItemViewHtmlBody style={ messageBody } body={ body } attachments={ this.props.message.attachments } />
            </div>
        );
    }
}
