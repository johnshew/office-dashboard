import * as React from 'react';


var noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

var bigStyle: React.CSSProperties = {
    height: '15pt',
    fontSize: '13pt'
}

var smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
}

var tightStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 0,
    marginBottom: 0
};

var snugStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 10,
    marginBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

var emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};



function Combine(...styles: React.CSSProperties[]): React.CSSProperties 
{  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}

interface MailSummaryProps {
    key: string;
    message: Kurve.Message;
    style?: Object;
}

export class MailSummary extends React.Component<MailSummaryProps, any> {
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        return (
            <div style={ snugStyle } >
            <h4 style={ big }>{this.props.message.data.sender.emailAddress.name}</h4>
            <p style={ smallBold }>{this.props.message.data.subject}</p>
            <p style={ small }>{this.props.message.data.bodyPreview}</p>
                </div>
        );
    }
}

interface MailListProps {
    data: Kurve.Message[];
}

export class MailList extends React.Component<MailListProps, any> {
    render() {
        var messageNodes = this.props.data.map((message) => {
            return (<MailSummary  key={message.data.id} message={message}/>);
        });
        return <div>
            { messageNodes }
            </div>;
    }
}
