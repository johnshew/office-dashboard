import * as React from 'react';
import * as Kurve from 'kurvejs';

import MailSummary from './MailSummary';

interface MailListProps extends React.Props<MailList> {
    messages: Kurve.MessageDataModel[];
    selectedMessage?: Kurve.MessageDataModel;
    onSelect(id: string);
}

export default class MailList extends React.Component<MailListProps, any> {
    render() {
        var messageSummaries = this.props.messages
            .map(message =>
                <MailSummary onSelect={this.props.onSelect} selected={this.props.selectedMessage && this.props.selectedMessage.id === message.id} key={message.id} message={message} />
            );
        return <div>{messageSummaries}</div>;
    }
}
