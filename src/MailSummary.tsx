import * as React from 'react';
import * as Kurve from 'Kurve';
import * as Utilities from './Utilities';

import Combine = Utilities.Combine;
import ShortTimeString = Utilities.ShortTimeString;

const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '16pt',
    fontSize: '13pt'
};

const smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
};

const tightStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 0,
    marginBottom: 0
};

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const summaryStyle: React.CSSProperties = {
    padding: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const summaryPreviewStyle: React.CSSProperties = {
    width: '75%',
    float: 'left'
}

const summaryDateStyle: React.CSSProperties = {
    width: '25%',
    textAlign: 'right',
    float: 'left'
}

const clearStyle: React.CSSProperties = {
    clear: 'both'
}

const selectedSummaryStyle = Combine(summaryStyle, {
    backgroundColor: "LightBlue"
});

interface MailSummaryProps extends React.Props<MailSummary> {
    key: string;
    message: Kurve.MessageDataModel;
    style?: Object;
    selected?: boolean;
    onSelect(messageId: string);
}

export default class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = () => {
        this.props.onSelect(this.props.message.id);
    };

    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        var message = this.props.message;
        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{(message.sender) ? message.sender.emailAddress.name : ""}</p>
                <p style={ smallBold }>{message.subject}</p>
                <p style={ Combine(small, summaryPreviewStyle) }>{message.bodyPreview}</p>
                <p style={ Combine(small, summaryDateStyle) }>{ ShortTimeString(message.receivedDateTime) }</p>
                <div style={ clearStyle }/>
            </div>
        );
    }
}
