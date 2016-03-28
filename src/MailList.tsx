import * as React from 'react';

import MailSummary from './MailSummary';

interface MailListProps extends React.Props<MailList> {
    messages: Kurve.MessageDataModel[];
    selectedMailFolders? : Kurve.MailFolderDataModel[];
    selectedMessage?: Kurve.MessageDataModel;
    onSelect(id: string);
}

export default class MailList extends React.Component<MailListProps, any> {
    render() {
        var messageSummaries = this.props.messages
            .filter(message => this.props.selectedMailFolders.some((mailFolder) => message.parentFolderId === mailFolder.id))
            .map(message =>
                <MailSummary onSelect={this.props.onSelect} selected={this.props.selectedMessage && this.props.selectedMessage.id === message.id} key={message.id} message={message} />
            );
        return <div>{messageSummaries}</div>;
    }
}
