import * as React from 'react';
import type { Message, Recipient } from '@microsoft/microsoft-graph-types';
import { AttachmentDictionary } from './Utilities';

import ItemViewHtmlBody from './ItemViewHtmlBody';

interface MessageViewProps {
    message: Message;
    attachments?: AttachmentDictionary;
    onMessageAttachmentDownloadRequest: (messageId: string) => void;
    style?: React.CSSProperties;
}

export default class MessageView extends React.Component<MessageViewProps, any> {
    state = { imageConsent: null as Message | null };
    private Header: HTMLHeadingElement;

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        const nextProps = this.props;
        if (!nextProps.attachments && nextProps.message && nextProps.message.attachments &&
            nextProps.message.attachments.some(attachment => attachment.isInline)) {
            nextProps.onMessageAttachmentDownloadRequest(nextProps.message.id);
        }
    }

    private recipients(mailboxes: Recipient[], prefix: string) {
        var recipientList = (mailboxes || []).map(recipient => recipient.emailAddress?.name || recipient.emailAddress?.address || '').filter(Boolean).join('; ');
        if (recipientList) {
            return <React.Fragment><dt>{prefix}</dt><dd>{recipientList}</dd></React.Fragment>;
        }
        return null;
    }

    public scrollToTop() {
        this.Header?.focus({ preventScroll: true });
    }

    render() {
        var message = this.props.message;
        if (!message) { return <div className="mail-empty">No message selected</div>; }
        var subject = message.subject || "";
        var from = message.sender && message.sender.emailAddress && message.sender.emailAddress.name || "";
        var body = message.body && message.body.content || "";
        const received = new Date(message.receivedDateTime);
        const showImages = this.state.imageConsent === message;

        return (
            <article className="message-view" style={this.props.style}>
                <header className="message-header">
                    <h2 tabIndex={-1} ref={header => { this.Header = header; }}>{subject || '(No subject)'}</h2>
                    <p className="message-sender">{from || message.sender?.emailAddress?.address || 'Unknown sender'}
                        {from && message.sender?.emailAddress?.address && <span> &lt;{message.sender.emailAddress.address}&gt;</span>}
                    </p>
                    <dl className="message-metadata">
                        {this.recipients(message.toRecipients, 'To')}
                        {this.recipients(message.ccRecipients, 'Cc')}
                        {this.recipients(message.bccRecipients, 'Bcc')}
                        {!Number.isNaN(received.getTime()) && <><dt>Received</dt><dd><time dateTime={message.receivedDateTime}>
                            {received.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
                        </time></dd></>}
                    </dl>
                    {message.body?.contentType !== 'text' && <div className="message-image-controls">
                        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={showImages}
                            onClick={() => this.setState({ imageConsent: message })}>
                            {showImages ? 'Images Shown' : 'Show Images'}
                        </button>
                        <span>{showImages ? 'External images enabled for this message.' : 'Loading images may notify the sender.'}</span>
                    </div>}
                </header>
                <ItemViewHtmlBody style={{}} body={body} attachments={this.props.attachments} plainText={message.body?.contentType === 'text'} fitContainer showImages={showImages} />
            </article>
        );
    }
}
