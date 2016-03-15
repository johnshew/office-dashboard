import * as React from 'react';

import MailSummary from './MailSummary';

interface MailListProps extends React.Props<MailList> {
    messages: Kurve.MessageDataModel[];
    selected?: string;
    onSelection?(id: string);
}

export default class MailList extends React.Component<MailListProps, any> {
    constructor(props, state) {
        super(props, state);
    }

    private handleSelect = (id: string) => {
        this.props.onSelection(id);
    };

    render() {
        var messageSummaries = this.props.messages.map(message =>
            <MailSummary onSelect={this.handleSelect} selected={this.props.selected === message.id} key={message.id} message={message} />
        );
        return <div>{messageSummaries}</div>;
    }
}
