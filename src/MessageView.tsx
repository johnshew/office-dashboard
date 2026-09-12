import * as React from 'react';
import type { Message, Recipient } from '@microsoft/microsoft-graph-types';
import { AttachmentDictionary } from './Utilities';

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

interface MessageViewProps {
    message: Message;
    attachments?: AttachmentDictionary;
    onMessageAttachmentDownloadRequest: (messageId: string) => void;
    style?: React.CSSProperties;
}

export default class MessageView extends React.Component<MessageViewProps, any> {
    private Header: HTMLDivElement;

    componentDidUpdate() {
        const nextProps = this.props;
        if (!nextProps.attachments && nextProps.message && nextProps.message.attachments &&
            nextProps.message.attachments.some(attachment => attachment.isInline)) {
            nextProps.onMessageAttachmentDownloadRequest(nextProps.message.id);
        }
    }

    private recipients(mailboxes: Recipient[], style: React.CSSProperties, prefix: string) {
        var recipientList = (mailboxes || []).reduce<string>((p, c) => { return (p ? p + "; " : "") + c.emailAddress.name; }, null);
        if (recipientList) {
            return <p style={ style }> { prefix }: { recipientList }</p>;
        }
        return null;
    }

    public scrollToTop() {
        try { this.Header.scrollIntoView(); } catch (err) { }
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var messageBody = Combine(bodyStyle, this.props.style);
        var message = this.props.message;
        if (!message) { return null; }
        var subject = message.subject || "";
        var from = message.sender && message.sender.emailAddress && message.sender.emailAddress.name || "";
        var body = message.body && message.body.content || "";
        if (message.body && message.body.contentType === "text") {
            messageBody = Combine(messageBody, plainTextStyle);
        }

        return (
            <div>
                <div ref={(c) => { this.Header = c; } }  className="well" style={  { padding: 10 } }>
                    <p style={ big }>{from}</p>
                    <p style={ smallEmphasis }>{subject}</p>
                    { this.recipients(message.toRecipients, small, "To") }
                    { this.recipients(message.ccRecipients, small, "Cc") }
                    { this.recipients(message.bccRecipients, small, "Bcc") }
                    <p style={ small }>{ ShortTimeString(message.receivedDateTime) }</p>
                </div>

                <ItemViewHtmlBody style={messageBody} body={body} attachments={this.props.attachments} plainText={message.body?.contentType === "text"} />
            </div>
        );
    }
}
