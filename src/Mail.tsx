import * as React from 'react';
import type { Message } from '@microsoft/microsoft-graph-types';
import { MessageAttachments } from './Utilities';

import MailList from './MailList';
import MessageView from './MessageView';

interface MailProps {
    messages: Message[];
    messageAttachments?: MessageAttachments;
    onMessageAttachmentDownloadRequest: (messageId: string) => void;
    mailboxes: string[];
    scroll: boolean;
}

interface MailState {
    mailboxFilter?: string[];
    selected?: string;
}

export default class Mail extends React.Component<MailProps, MailState> {
    private values: any[];
    private mailViewRef: any;
    private messageView: MessageView;

    constructor(props, state) {
        super(props, state);
        this.state = { mailboxFilter: [], selected: null };
    }

    private handleMultiChange = (e: string[]) => {
        console.log(JSON.stringify(e));
        this.setState({
            mailboxFilter: e
        });
    }

    private handleSelection = (id: string) => {
        this.setState({ selected: id }, () => this.messageView?.scrollToTop());
    }

    private showInbox = () => {
        const selectedRow = document.querySelector<HTMLButtonElement>('.mail-summary[aria-pressed="true"]');
        this.setState({ selected: null }, () => selectedRow?.focus({ preventScroll: true }));
    }

    private selectedMessage(): Message {
        var found = this.props.messages.filter((message) => (message.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        /*
                var options = this.props.mailboxes.map(mailboxName =>
                    <option value={mailboxName}>{mailboxName}</option>
                );
        */

        var attachments = this.props.messageAttachments && this.state.selected && this.props.messageAttachments.messageId === this.state.selected ? this.props.messageAttachments.attachments : null;

        return (
            <div className={`mail-workspace${this.selectedMessage() ? ' has-selection' : ''}`}>
                <section className="mail-list-pane" aria-label="Inbox">
                    <h1 className="mail-list-heading">Inbox</h1>
                    <MailList onSelection={ this.handleSelection } selected={ this.state.selected } messages={ this.props.messages } />
                </section>
                <section className="mail-reader" aria-label="Reading pane">
                    <button type="button" className="mail-back" onClick={this.showInbox}>Back to Inbox</button>
                    <MessageView
                        key={this.state.selected}
                        ref={ (c) => { this.messageView = c; } }
                        message={ this.selectedMessage() }
                        attachments={ attachments }
                        onMessageAttachmentDownloadRequest={ this.props.onMessageAttachmentDownloadRequest } />
                </section>
            </div>
        );
    }
}

/*
                    <SelectBox label="All Mailboxes" onChange={this.handleMultiChange} value={this.state.mailboxFilter} multiple={true}>
                        {options}
                    </SelectBox>
*/
