import * as React from 'react';
import * as Utilities from './utilities';
import { SelectBox } from './selectbox';
import * as ScopedStyles from './scopedStylePolyfill';

import Combine = Utilities.Combine;
import ShortTimeString = Utilities.ShortTimeString;

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


const listStyle: React.CSSProperties = {
    height: "100%",
    borderRight: "thin solid",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

const itemViewStyle: React.CSSProperties = {
    height: "100%",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

const bodyStyle: React.CSSProperties = {
    paddingRight: 10,
    paddingLeft: 10,
}

const plainTextStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap"
}

const scrollingContentStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    top: "51px",
    bottom: "0px"
}

interface EventSummaryProps extends React.Props<EventSummary> {
    event: Kurve.EventDataModel;
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
        this.props.onSelect(this.props.event.id);
    };
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        var event = this.props.event;
        if (event.start.timeZone != "UTC") throw "Unexpected date format";

        var startTime = new Date(event.start.dateTime + 'Z').toLocaleTimeString().replace(/\u200E/g, "").replace(/:\d\d\s/, " ");
        var span = new DateSpan(event.end.dateTime, event.start.dateTime);
        var duration = ((span.days != 0) ? span.days + " days " : "") + (span.hours != 0 ? span.hours + " hours " : "") + (span.minutes != 0 ? span.minutes + " mins " : "");
        var location = event.location && event.location.displayName;
        var organizer = event.organizer && event.organizer.emailAddress && event.organizer.emailAddress.name;

        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{startTime + (duration ? " / " + duration : "") }</p>
                { event.subject ? <p style={ smallBold }> { event.subject } </p> : null }
                { location ? <p style={ small }>{ location }</p> : null}
            </div>
        );
    }
}

interface EventListProps extends React.Props<EventList> {
    events: Kurve.EventDataModel[];
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
        var eventSummaries = this.props.events.map(event => {
            var date = new Date(event.start.dateTime).toDateString();
            var dateSeparator = (date != lastDate) ? <div style= { informationStyle }>{ date }</div> : null;
            lastDate = date;
            return (
                <div key={ event.id }>
                    { dateSeparator }
                    <EventSummary onSelect={ this.handleSelect } selected={ this.props.selected === event.id } event={ event } />
                </div>
            );
        });
        return <div>{ eventSummaries }</div>;
    }
}

interface MailSummaryProps extends React.Props<MailSummary> {
    key: string;
    message: Kurve.MessageDataModel;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId: string);
}

export class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
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

interface MailListProps extends React.Props<MailList> {
    messages: Kurve.MessageDataModel[];
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
        var messageSummaries = this.props.messages.map(message =>
            <MailSummary onSelect={this.handleSelect} selected={ this.props.selected === message.id} key={message.id} message={message}/>
        );
        return <div>{ messageSummaries }</div>;
    }
}

function CleanUp(html: string, inlineAttachments: Array<Kurve.Attachment>) {
    var doc = document.implementation.createHTMLDocument("example");
    doc.documentElement.innerHTML = html;

    // Create a new <div/> in the body and move all existing body content to that the new div.
    var resultElement = doc.createElement("div");
    var node: Node;
    while (node = doc.body.firstChild) {
        doc.body.removeChild(node);
        resultElement.appendChild(node);
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

    // Inline attachments
    var inlineImages = doc.body.querySelectorAll("img[src^='cid'");

    [].forEach.call(inlineImages, function (image) {
        var contentId = image.src.replace('cid:', '');
        var foundInAttachments = inlineAttachments.filter((a) => { return a.data.contentId === contentId; });

        if (foundInAttachments.length > 0) {
            var attachment = foundInAttachments[0].data;
            image.src = 'data:' + attachment.contentType + ';base64,' + attachment.contentBytes;
        } else {
            image.src = '/public/loading.gif';
            image.width = 25;
            image.height = 25;
        }
    });

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
    message: Kurve.MessageDataModel;
    attachments: Kurve.Attachment[];
    onMessageAttachmentDownloadRequest: (messageId: string, attachmentId: string) => void;
    style?: React.CSSProperties;
}

export class MessageView extends React.Component<MessageViewProps, any>
{
    private Header: HTMLDivElement;

    /*    private check(text: string) {
            return (text != null) ? text : "";
        }
    */

    constructor(props, state) {
        super(props, state);
        this.state = { inlineAttachments: [] };
    }

    componentWillUpdate(nextProps: MessageViewProps) {
        if (nextProps.message) {
            var message = nextProps.message;

            message['attachments'].forEach((item) => {
                if (!item.isInline) { return; }

                var attachment = this.findAttachment(item.id);

                // If attachment is not cached it will notify the App load load each.
                if (!attachment) {
                    nextProps.onMessageAttachmentDownloadRequest(message.id, item.id);
                }
            });
        }
    }

    private findAttachment(attachmentId): Kurve.Attachment {
        var found = this.props.attachments.filter((attachment) => (attachment.data.id === attachmentId));
        return (found.length > 0) ? found[0] : null;
    }

    private recipients(mailboxes: Kurve.Recipient[], style: React.CSSProperties, prefix: string) {
        var recipientList = mailboxes.reduce((p, c) => { return (p ? p + "; " : "") + c.emailAddress.name; }, null);
        if (recipientList) {
            return <p style={ style }> { prefix }: { recipientList }</p>;
        }
        return null;
    }

    public scrollToTop() {
        try { this.Header.scrollIntoView(); } catch (err) { }
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var messageBody = Combine(bodyStyle, this.props.style);
        var message = this.props.message;
        if (!message) { return null; }
        var subject = message.subject || "";
        var from = message.sender && message.sender.emailAddress && message.sender.emailAddress.name || "";
        var body = message.body && message.body.content || "";
        if (message.body && message.body.contentType === "text") {
            messageBody = Combine(messageBody, plainTextStyle);
        }

        return (
            <div>
                <div ref={(c) => { this.Header = c; } }  className="well" style={  { padding: 10 } }>
                    <p style={ big }>{from}</p>
                    <p style={ smallEmphasis }>{subject}</p>
                    { this.recipients(message.toRecipients, small, "To") }
                    { this.recipients(message.ccRecipients, small, "Cc") }
                    { this.recipients(message.bccRecipients, small, "Bcc") }
                    <p style={ small }>{ ShortTimeString(message.receivedDateTime) }</p>
                </div>
                <div style={ messageBody } dangerouslySetInnerHTML={ CleanUp(body, this.props.attachments ) } />
            </div>
        );
    }
}

interface EventViewProps extends React.Props<EventView> {
    event: Kurve.EventDataModel;
    style?: React.CSSProperties;
}

export class EventView extends React.Component<EventViewProps, any>
{
    private check(text: string) {
        return (text != null) ? text : "";
    }

    private attendees() {
        var x = this.props.event.attendees;
        return x.reduce((p, a) => {
            var result = ((p != null) ? p + '; ' : '') + a.emailAddress.name;
            return result;
        }, null);
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var messageBody = Combine(bodyStyle, this.props.style);
        var event = this.props.event;
        if (!event) { return null; }
        var subject = event.subject || "";
        var organizer = event.organizer && event.organizer.emailAddress && event.organizer.emailAddress.name || "";
        var attendees = this.attendees() || "";
        var body = event.body && event.body.content || "";
        if (event.body && event.body.contentType === "text") {
            messageBody = Combine(messageBody, plainTextStyle);
        }
        return (
            <div>
                <div className="well" style={  { padding: 10 } }>
                    <p style={ big }>{organizer}</p>
                    <p style={ smallEmphasis }>{subject}</p>
                    <p style={ small }>{attendees}</p>
                </div>
                <div style={ messageBody } dangerouslySetInnerHTML={ CleanUp(body, []) } />
            </div>
        );
    }
}

interface MailProps extends React.Props<Mail> {
    messages: Kurve.MessageDataModel[];
    attachments: Kurve.Attachment[];
    onMessageAttachmentDownloadRequest: (messageId: string, attachmentId: string) => void;
    mailboxes: string[];
    scroll: boolean;
}

interface MailState {
    mailboxFilter?: string[];
    selected?: string;
}

export class Mail extends React.Component<MailProps, MailState>
{
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
        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <MailList onSelection={ this.handleSelection } selected={ this.state.selected } messages={ this.props.messages } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <MessageView
                        ref={ (c) => this.messageView = c }
                        message={this.selectedMessage()}
                        attachments={this.props.attachments}
                        onMessageAttachmentDownloadRequest={this.props.onMessageAttachmentDownloadRequest.bind(this)} />
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
    events: Kurve.EventDataModel[];
    scroll: boolean;
}

interface CalendarState {
    selected?: string;
}

export class Calendar extends React.Component<CalendarProps, CalendarState>
{
    //private values: any[];
    constructor(props, state) {
        super(props, state);
        this.state = { selected: null };
    }

    private handleSelection = (id: string) => {
        this.setState({ selected: id });
    }

    private selectedCalendarEvent(): Kurve.EventDataModel {
        var found = this.props.events.filter(event => (event.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        var contentLayoutStyle = (this.props.scroll) ? scrollingContentStyle : {};
        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <EventList onSelection={ this.handleSelection } selected={ this.state.selected } events={ this.props.events } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <EventView event={this.selectedCalendarEvent() } />
                </div>
            </div>
        );
    }
}

