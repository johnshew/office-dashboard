import * as React from 'react';
import { SelectBox } from './selectbox';
import * as ScopedStyles from './scopedStylePolyfill';

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

const informationStyle = Combine(summaryStyle, {
    backgroundColor: "LightGrey"
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


interface EventSummaryProps extends React.Props<EventSummary> {
    key: string;
    item: Kurve.Event;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId: string);
}

class DateSpan {
    public days: number;
    public hours: number;
    public minutes: number;

    constructor(e: any, s: any) {
        var em = typeof e == 'string' ? Date.parse(e) : typeof e == 'number' ? e : typeof e == 'Date' ? (e as Date).getTime() : null;
        var sm = typeof s == 'string' ? Date.parse(s) : typeof s == 'number' ? s : typeof s == 'Date' ? (s as Date).getTime() : null;
        if (!sm || !em) throw new Error("DataSpan: constructor bad argument type");
        this.minutes = Math.floor((em - sm) / (60 * 1000));
        this.hours = Math.floor(this.minutes / 60);
        this.days = Math.floor(this.hours / 24);
        this.hours -= this.days * 24;
        this.minutes -= ((this.days * 24) + this.hours) * 60;
    }       
}

export class EventSummary extends React.Component<EventSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
        this.props.onSelect(this.props.item.data["id"]);
    };
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        var d = this.props.item.data;
        var startTime = new Date(d.start.dateTime).toLocaleTimeString().replace(/\:\d\d /, " ");
        var span = new DateSpan(d.end.dateTime, d.start.dateTime);
        var duration = ((span.days != 0) ? span.days + " days " : "") + (span.hours != 0 ? span.hours + " hours " : "") + (span.minutes != 0 ? span.minutes + " mins " : "");        
        var location = d.location && d.location["displayName"];
        var organizer = d.organizer && d.organizer.emailAddress && d.organizer.emailAddress.name;
        
        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{startTime + (duration ? " / " + duration : "") }</p>
                { d.subject ? <p style={ smallBold }> { d.subject } </p> : null }
                { location ? <p style={ small }>{ location }</p> : null}
            </div>
        );
    }
}

interface EventListProps extends React.Props<EventList> {
    data: Kurve.Event[];
    selected?: string;
    onSelection?(id: string);
}

export class EventList extends React.Component<EventListProps, any> {
    constructor(props, state) {
        super(props, state);
    }
    private handleSelect = (id: string) => {
        this.props.onSelection(id);
    };
    render() {
        var lastDate = "";
        var items = this.props.data.map((item) => {
            var date = new Date(item.data.start.dateTime);
            var dateSeperator = ((date.toDateString() != lastDate) ? <div style= { informationStyle }> { date.toDateString() } </div> : <div></div>);
            lastDate = date.toDateString();
            return (<div>
                { dateSeperator }
                <EventSummary  onSelect= { this.handleSelect } selected= { this.props.selected === item.data["id"]}  key= { item.data["id"]} item= { item } />
                </div>
                );
        
        });
        return <div> { items } </div>;
    }
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



function CleanUp(html: string) {
    var doc = document.implementation.createHTMLDocument("example");
    doc.documentElement.innerHTML = html;
    
    // Create a new <div/> in the body and move all existing body content to that the new div.
    var resultElement = doc.createElement("div");
    var count = doc.body.childNodes.length;
    for (var i = 0; i < count; i++) {
        var bodyNode = doc.body.childNodes.item(0);
        doc.body.removeChild(bodyNode);
        resultElement.appendChild(bodyNode);        
    }

    doc.body.appendChild(resultElement);
    
    // Move all styles in <head/> into the new <div/> 
    var headList = doc.getElementsByTagName("head");
    if (headList.length == 1) {
        var head = headList.item(0);
        var styles = head.getElementsByTagName("style");
        var styleIndex = styles.length;
        while (styleIndex--) {
            var styleNode = styles.item(styleIndex);
            if (styleNode.parentNode === head) {
                head.removeChild(styleNode);
                resultElement.appendChild(styleNode);
            }
        }
    }

    // Make sure all styles are scoped
    var styles = doc.getElementsByTagName("style");
    var styleIndex = styles.length;
    while (styleIndex--) {
        styles.item(styleIndex).setAttribute("scoped", "");
    }
    ScopedStyles.ScopeStyles(doc.documentElement); // polyfill scoping if necessary
    
    return { __html: doc.body.innerHTML }
}

interface MessageViewProps extends React.Props<MessageView> {
    message: Kurve.Message;
    style?: React.CSSProperties;
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
        return "";
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var data = this.props.message && this.props.message.data;
        if (!data) { return null; }
        var subject =  data.subject || "";
        var from =  data.sender && data.sender.emailAddress && data.sender.emailAddress.name || "";
        var toRecipients = this.toLine() || "";
        var body = data.body && this.props.message.data.body["content"] || ""; //TODO Fix Kurve
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



interface EventViewProps extends React.Props<EventView> {
    event: Kurve.Event;
    style?: React.CSSProperties;
}

export class EventView extends React.Component<EventViewProps, any>
{
    private check(text: string) {
        return (text != null) ? text : "";
    }

    private attendees() {
        var x = this.props.event.data.attendees;
        return x.reduce((p, a) => {
            var result = ((p != null) ? p + '; ' : '') + a. emailAddress.name;
            return result;
        }, null);
        return "";
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var data = this.props.event && this.props.event.data;
        if (!data) { return null; }
        var subject = data.subject || "";
        var organizer = data.organizer && data.organizer.emailAddress && data.organizer.emailAddress.name || "";
        var attendees = this.attendees() || "";
        var body = data.body && this.props.event.data.body["content"] || ""; //TODO Fix Kurve
        return (
            <div>
              <div className="well" style={  { padding: 10 } }>
                <p style={ big }>{organizer}</p>
                <p style={ smallEmphasis }>{subject}</p>
                <p style={ small }>{attendees}</p>
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


interface CalendarProps extends React.Props<Calendar> {
    data: Kurve.Event[];
}

interface CalendarState {
    selected?: string;
}



export class Calendar extends React.Component<CalendarProps, CalendarState>
{
    private values: any[];
    constructor(props, state) {
        super(props, state);
        this.state = { selected: null };
    }

    private handleSelection = (id: string) => {
        this.setState({ selected: id });
    }

    private selectedCalendarEvent(): Kurve.Event {
        var found = this.props.data.filter((message) => (message.data["id"] === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {

        return (
            <div>
                <div className="col-xm-12 col-sm-6 col-lg-3" style={ mailListStyle }>
                    <div>
                        <EventList onSelection={ this.handleSelection } selected={this.state.selected } data={ this.props.data } />
                    </div>                    
                </div>
                <div className="col-sm-12 col-sm-6 col-lg-9" style={ mailViewStyle }>
                    <EventView event={this.selectedCalendarEvent() } />
                </div>
            </div>);
            
    }
}

