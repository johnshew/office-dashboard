import * as React from 'react';
import { SelectBox } from './selectbox';
import { ScopeStyles} from './scopedStylePolyfill';

const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '16pt',
    fontSize: '13pt'
}

const smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
}

const tightStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 0,
    marginBottom: 0
};

const summaryStyle: React.CSSProperties = {
    padding: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const selectedSummaryStyle = Combine(summaryStyle, {
    backgroundColor: "LightBlue"
});

const mailViewStyle: React.CSSProperties = {
    paddingRight: 0,
    paddingLeft: 0
}

const mailListStyle: React.CSSProperties = {
    minHeight: "100vh",
    borderRight: "thin solid",
    paddingRight: 0,
    paddingLeft: 0
}

function Combine(...styles: React.CSSProperties[]): React.CSSProperties {  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}

interface MailSummaryProps extends React.Props<MailSummary> {
    key: string;
    message: Kurve.Message;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId: string);
}

export class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
        this.props.onSelect(this.props.message.data.id);
    };
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        var d = this.props.message.data;
        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{(d.sender) ? d.sender.emailAddress.name : ""}</p>
                <p style={ smallBold }>{this.props.message.data.subject}</p>
                <p style={ small }>{this.props.message.data.bodyPreview}</p>
                </div>
        );
    }
}

interface MailListProps extends React.Props<MailList> {
    data: Kurve.Message[];
    selected?: string;
    onSelection?(id: string);
}

export class MailList extends React.Component<MailListProps, any> {
    constructor(props, state) {
        super(props, state);
    }
    private handleSelect = (id: string) => {
        this.props.onSelection(id);
    };
    render() {
        var messageNodes = this.props.data.map((message) => {
            return (<MailSummary  onSelect={this.handleSelect} selected={ this.props.selected === message.data.id}  key={message.data.id} message={message}/>);
        });
        return <div>
            { messageNodes }
            </div>;
    }
}

interface MessageViewProps extends React.Props<MessageView> {
    message: Kurve.Message;
    style?: React.CSSProperties;
}

function CleanUp(html: string) {
    var doc = document.implementation.createHTMLDocument("example");
    doc.documentElement.innerHTML = html;
    var style = doc.getElementsByTagName("style");
    var body = doc.body;

    for (var i = 0; i < style.length; i++) {
        style.item(i).setAttribute("scoped", "");
    }
    ScopeStyles(doc); //BUG: not working.  Updates the DOM but the inner HTML isn't working right.
    return { __html: doc.body.innerHTML }  
    //TODO: for now just grabbing body since the style scoping polyfill is not working on a disconnected document. This workaround eliminates some the style issues.
    // Probabaly the best thing to do create a div that is a child of the body and then move all the other body children into the new div along with the style elements from the head.
    // Then run ScopeStyles and pull the innerHTML from body (assuming ScopeStyles is working)   
}


export class MessageView extends React.Component<MessageViewProps, any>
{
    private check(text: string) {
        return (text != null) ? text : "";
    }

    private toLine() {
        var x: any[] = this.props.message.data.toRecipients;
        return x.reduce((p, c) => {
            var result = ((p != null) ? p + '; ' : 'To: ') + c.emailAddress.name;
            return result;
        }, null);
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var subject = this.props.message && this.props.message.data.subject || "";
        var from = this.props.message && this.props.message.data.sender.emailAddress.name || "";
        var toRecipients = this.props.message && this.toLine() || "";
        var body = this.props.message && this.props.message.data.body["content"] || ""; //TODO Fix Kurve
        return (
            <div>
              <div className="well" style={  { padding: 10 } }>
                <p style={ big }>{from}</p>
                <p style={ smallEmphasis }>{subject}</p>
                <p style={ small }>{toRecipients}</p>
                  </div>
              <div style={  { paddingRight: 10, paddingLeft: 10 } } dangerouslySetInnerHTML={ CleanUp(body) }>
                  </div>
                </div>
        );
    }
}

interface MailProps extends React.Props<Mail> {
    data: Kurve.Message[];
    mailboxes: string[];
}

interface MailState {
    mailboxFilter?: string[];
    selected?: string;
}

export class Mail extends React.Component<MailProps, MailState>
{
    private values: any[];
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
    }

    private selectedMessage(): Kurve.Message {
        var found = this.props.data.filter((message) => (message.data.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        var options = this.props.mailboxes.map((mailboxName) => {
            return <option value={mailboxName}>{mailboxName}</option>
        });

        return (
            <div>
            <div className="col-xm-12 col-sm-6 col-lg-3" style={ mailListStyle }>
                <div>
                    <MailList onSelection={ this.handleSelection } selected={this.state.selected } data={ this.props.data } />
                    </div>
                </div>
            <div className="col-sm-12 col-sm-6 col-lg-9" style={ mailViewStyle }>
                <MessageView message={this.selectedMessage() }/>
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