import * as React from 'react';

import MailSummary from './MailSummary';

interface MailListProps extends React.Props<MailList> {
    messages: Kurve.MessageDataModel[];
    selectedMailFolder? : Kurve.MailFolderDataModel;
    selectedMessage?: Kurve.MessageDataModel;
    onSelect(id: string);
}

export default class MailList extends React.Component<MailListProps, any> {
    render() {
        var messageSummaries = this.props.messages
            .filter(message => { return message.parentFolderId === this.props.selectedMailFolder.id })
            .map(message =>
                <MailSummary onSelect={this.props.onSelect} selected={this.props.selectedMessage && this.props.selectedMessage.id === message.id} key={message.id} message={message} />
            );
        return <div>{messageSummaries}</div>;
    }
}
