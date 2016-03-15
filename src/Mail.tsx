import * as React from 'react';
import { MessageAttachments } from './Utilities';

import MailList from './MailList';
import MessageView from './MessageView';

const itemViewStyle: React.CSSProperties = {
    height: "100%",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

const scrollingContentStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    top: "51px",
    bottom: "0px"
}

const listStyle: React.CSSProperties = {
    height: "100%",
    borderRight: "thin solid",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

interface MailProps extends React.Props<Mail> {
    messages: Kurve.MessageDataModel[];
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
        this.setState({ selected: id });
        this.messageView.scrollToTop();
    }

    private selectedMessage(): Kurve.MessageDataModel {
        var found = this.props.messages.filter((message) => (message.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        /*
                var options = this.props.mailboxes.map(mailboxName =>
                    <option value={mailboxName}>{mailboxName}</option>
                );
        */

        var contentLayoutStyle = (this.props.scroll) ? scrollingContentStyle : {};
        var attachments = this.props.messageAttachments && this.state.selected && this.props.messageAttachments.messageId === this.state.selected ? this.props.messageAttachments.attachments : null;

        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <MailList onSelection={ this.handleSelection } selected={ this.state.selected } messages={ this.props.messages } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <MessageView
                        ref={ (c) => this.messageView = c }
                        message={ this.selectedMessage() }
                        attachments={ attachments }
                        onMessageAttachmentDownloadRequest={ this.props.onMessageAttachmentDownloadRequest } />
                </div>
            </div>
        );
    }
}

/*
                    <SelectBox label="All Mailboxes" onChange={this.handleMultiChange} value={this.state.mailboxFilter} multiple={true}>
                        {options}
                    </SelectBox>
*/
