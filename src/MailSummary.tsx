import * as React from 'react';
import type { Message } from '@microsoft/microsoft-graph-types';
import { ShortTimeString } from './Utilities';

interface MailSummaryProps {
    key: string;
    message: Message;
    style?: React.CSSProperties;
    selected?: boolean;
    onSelect?(messageId: string);
}

export default class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
        this.props.onSelect(this.props.message.id);
    };

    render() {
        const message = this.props.message;
        const sender = message.sender?.emailAddress;
        return (
            <button type="button" className="mail-summary" style={this.props.style}
                aria-pressed={!!this.props.selected} onClick={this.handleClick}>
                <span className="mail-summary-sender">{sender?.name || sender?.address || 'Unknown sender'}</span>
                <time className="mail-summary-date" dateTime={message.receivedDateTime}>{ShortTimeString(message.receivedDateTime)}</time>
                <span className="mail-summary-subject">{message.subject || '(No subject)'}</span>
            </button>
        );
    }
}
