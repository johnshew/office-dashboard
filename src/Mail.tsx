import * as React from 'react';
import * as Kurve from 'Kurve';
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
    messages?: Kurve.MessageDataModel[];
    selectedMessage?: Kurve.MessageDataModel;
    onSelect(id:string);
    scroll: boolean;
}

export default class Mail extends React.Component<MailProps, any> {
    private messageView: MessageView;

    render() {
        if (!this.props.messages)
            return null;
        var contentLayoutStyle = (this.props.scroll) ? scrollingContentStyle : {};
//      var selectedMessage = this.props.selectedMessage ? this.props.selectedMessage : new Kurve.MessageDataModel();

        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <MailList onSelect={ this.props.onSelect } messages={ this.props.messages } selectedMessage={ this.props.selectedMessage } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <MessageView ref={ (c) => this.messageView = c } message={ this.props.selectedMessage }/>
                </div>
            </div>
        );
    }
}
